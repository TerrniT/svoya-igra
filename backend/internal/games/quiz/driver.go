package quiz

import (
	"encoding/json"
	"math"
	"math/rand/v2"
	"strings"
	"time"

	"svoya-igra/internal/chooser"
	"svoya-igra/internal/gamekit"
	"svoya-igra/internal/protocol"
	"svoya-igra/internal/text"
)

type Category struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Order int    `json:"order"`
}

type Answer struct {
	ID        string `json:"id"`
	Text      string `json:"text"`
	IsCorrect bool   `json:"isCorrect"`
}

type Question struct {
	ID         string   `json:"id"`
	CategoryID string   `json:"categoryId"`
	Value      int      `json:"value"`
	Text       string   `json:"text"`
	Kind       string   `json:"kind"`
	Answers    []Answer `json:"answers"`
}

type Bank struct {
	Categories []Category `json:"categories"`
	Questions  []Question `json:"questions"`
}

type Submission struct {
	PlayerID  string   `json:"playerId"`
	AnswerIDs []string `json:"answerIds"`
	Text      string   `json:"text"`
	Skipped   bool     `json:"skipped,omitempty"`
}

type Payload struct {
	Bank                Bank           `json:"bank"`
	ChooserID           *string        `json:"chooserId"`
	AnsweredQuestionIDs []string       `json:"answeredQuestionIds"`
	CurrentQuestionID   *string        `json:"currentQuestionId"`
	Answers             []Answer       `json:"answers"`
	Submissions         []Submission   `json:"submissions"`
	Revealed            bool           `json:"revealed"`
	Awarded             bool           `json:"awarded"`
	RoundScores         map[string]int `json:"roundScores"`
}

type Driver struct{}

func (Driver) CreatePayload(settings json.RawMessage) (any, error) {
	parsed, err := gamekit.DecodeSettings[Settings](settings)
	if err != nil {
		return nil, text.Error(BadBank)
	}
	return emptyPayload(parsed.Bank), nil
}

func (Driver) InitialPhase() string { return "lobby" }

func (Driver) CanStart(players []protocol.RoomPlayer, payload any, _ json.RawMessage) error {
	quiz, err := asPayload(payload)
	if err != nil {
		return err
	}
	if len(chooser.Playing(players)) == 0 {
		return text.Error(text.NeedOnePlayer)
	}
	if len(quiz.Bank.Questions) == 0 {
		return text.Error(NoQuestions)
	}
	return nil
}

func (d Driver) Reduce(raw json.RawMessage, ctx gamekit.Context) (gamekit.Result, error) {
	payload, err := asPayload(ctx.Payload)
	if err != nil {
		return gamekit.Result{}, err
	}
	var msg struct {
		Type           string   `json:"type"`
		Bank           *Bank    `json:"bank"`
		FirstChooserID string   `json:"firstChooserId"`
		PlayerID       string   `json:"playerId"`
		QuestionID     string   `json:"questionId"`
		AnswerIDs      []string `json:"answerIds"`
		Text           string   `json:"text"`
		Skipped        bool     `json:"skipped"`
		PlayerIDs      []string `json:"playerIds"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		return gamekit.Result{}, text.Error(text.BadMessage)
	}

	switch msg.Type {
	case "updateBank":
		if !ctx.IsHost {
			return gamekit.Result{}, text.Error(HostEditsBank)
		}
		if ctx.Phase != "lobby" {
			return gamekit.Result{}, text.Error(BankBeforeStart)
		}
		if msg.Bank == nil {
			return gamekit.Result{}, text.Error(BadBank)
		}
		payload.Bank = *msg.Bank
		return gamekit.Result{Payload: payload}, nil

	case "start", "playAgain":
		if !ctx.IsHost {
			return gamekit.Result{}, text.Error(text.HostStarts)
		}
		if err := d.CanStart(ctx.Players, payload, ctx.Settings); err != nil {
			return gamekit.Result{}, err
		}
		chooserID, err := chooser.RequireChooser(ctx.Players, msg.FirstChooserID)
		if err != nil {
			return gamekit.Result{}, err
		}
		scores := map[string]int{}
		for _, player := range ctx.Players {
			scores[player.ID] = 0
		}
		payload.AnsweredQuestionIDs = []string{}
		payload.ChooserID = &chooserID
		payload.CurrentQuestionID = nil
		payload.Answers = []Answer{}
		resetRound(&payload)
		started := time.Now().UTC().Format(time.RFC3339Nano)
		return gamekit.Result{
			Phase:     gamekit.Ptr("board"),
			Payload:   payload,
			Scores:    scores,
			StartedAt: gamekit.SetStartedAt(&started),
		}, nil

	case "setChooser":
		if !ctx.IsHost {
			return gamekit.Result{}, text.Error(HostPicksChooser)
		}
		if ctx.Phase != "board" && ctx.Phase != "lobby" {
			return gamekit.Result{}, text.Error(ChooserLocked)
		}
		chooserID, err := chooser.RequireChooser(ctx.Players, msg.PlayerID)
		if err != nil {
			return gamekit.Result{}, err
		}
		payload.ChooserID = &chooserID
		return gamekit.Result{Phase: gamekit.Ptr("board"), Payload: payload}, nil

	case "openQuestion":
		if payload.ChooserID == nil {
			return gamekit.Result{}, text.Error(ChooserRequired)
		}
		if !ctx.IsHost && ctx.ClientPlayerID != *payload.ChooserID {
			return gamekit.Result{}, text.Error(OtherPlayersTurn)
		}
		if contains(payload.AnsweredQuestionIDs, msg.QuestionID) {
			return gamekit.Result{}, text.Error(QuestionPlayed)
		}
		question := findQuestion(payload.Bank, msg.QuestionID)
		if question == nil {
			return gamekit.Result{}, text.Error(QuestionMissing)
		}
		id := question.ID
		payload.CurrentQuestionID = &id
		if questionKind(*question) == "free" {
			payload.Answers = []Answer{}
		} else {
			payload.Answers = shuffleAnswers(question.Answers)
		}
		resetRound(&payload)
		return gamekit.Result{Phase: gamekit.Ptr("question"), Payload: payload}, nil

	case "backToBoard":
		if !ctx.IsHost {
			return gamekit.Result{}, text.Error(HostBackToBoard)
		}
		phase := finishIfComplete(&payload, ctx.Players)
		return gamekit.Result{Phase: gamekit.Ptr(phase), Payload: payload}, nil

	case "skip":
		if !ctx.IsHost {
			return gamekit.Result{}, text.Error(HostSkipOnly)
		}
		if !contains(payload.AnsweredQuestionIDs, msg.QuestionID) {
			payload.AnsweredQuestionIDs = append(payload.AnsweredQuestionIDs, msg.QuestionID)
		}
		phase := finishIfComplete(&payload, ctx.Players)
		return gamekit.Result{Phase: gamekit.Ptr(phase), Payload: payload, Notices: []protocol.Notice{{Kind: "skip"}}}, nil

	case "answer":
		return answer(payload, ctx, msg.QuestionID, msg.AnswerIDs, msg.Text, msg.Skipped)

	case "reveal":
		if !ctx.IsHost {
			return gamekit.Result{}, text.Error(HostRevealOnly)
		}
		if ctx.Phase != "question" || payload.CurrentQuestionID == nil {
			return gamekit.Result{}, text.Error(NoOpenQuestion)
		}
		if !payload.Revealed {
			return revealRound(payload, ctx.Scores, ctx.Players)
		}
		return gamekit.Result{Payload: payload}, nil

	case "awardFree":
		return awardFree(payload, ctx, msg.QuestionID, msg.PlayerIDs)
	}

	return gamekit.Result{}, text.Error(UnknownMessage)
}

func (Driver) ToClientPayload(payload any, _ string, _ gamekit.Viewer) (any, error) {
	quiz, err := asPayload(payload)
	if err != nil {
		return nil, err
	}
	answers := quiz.Answers
	if !quiz.Revealed {
		hidden := make([]Answer, len(quiz.Answers))
		for i, answer := range quiz.Answers {
			hidden[i] = Answer{ID: answer.ID, Text: answer.Text, IsCorrect: false}
		}
		answers = hidden
	}
	submissions := quiz.Submissions
	if !quiz.Revealed {
		hidden := make([]Submission, len(quiz.Submissions))
		for i, item := range quiz.Submissions {
			hidden[i] = Submission{PlayerID: item.PlayerID, AnswerIDs: []string{}, Text: "", Skipped: false}
		}
		submissions = hidden
	}
	roundScores := quiz.RoundScores
	if !quiz.Revealed {
		roundScores = map[string]int{}
	}
	quiz.Answers = answers
	quiz.Submissions = submissions
	quiz.RoundScores = roundScores
	return quiz, nil
}

func (Driver) OnPlayerRemoved(payload any, playerID string) (any, error) {
	quiz, err := asPayload(payload)
	if err != nil {
		return payload, err
	}
	next := quiz.Submissions[:0]
	for _, item := range quiz.Submissions {
		if item.PlayerID != playerID {
			next = append(next, item)
		}
	}
	quiz.Submissions = next
	if quiz.ChooserID != nil && *quiz.ChooserID == playerID {
		quiz.ChooserID = nil
	}
	return quiz, nil
}

func (Driver) AfterDisconnect(payload any, players []protocol.RoomPlayer, scores map[string]int) *gamekit.Result {
	quiz, err := asPayload(payload)
	if err != nil || quiz.Revealed || quiz.CurrentQuestionID == nil {
		return nil
	}
	question := findQuestion(quiz.Bank, *quiz.CurrentQuestionID)
	if question == nil || !everyoneSubmitted(*question, players, quiz.Submissions) {
		return nil
	}
	result, err := revealRound(quiz, scores, players)
	if err != nil {
		return nil
	}
	return &result
}

func answer(payload Payload, ctx gamekit.Context, questionID string, answerIDs []string, answerText string, skipped bool) (gamekit.Result, error) {
	if ctx.Phase != "question" || payload.CurrentQuestionID == nil || *payload.CurrentQuestionID != questionID {
		return gamekit.Result{}, text.Error(WrongQuestion)
	}
	if payload.Revealed {
		return gamekit.Result{}, text.Error(AlreadyRevealed)
	}
	question := findQuestion(payload.Bank, *payload.CurrentQuestionID)
	if question == nil {
		return gamekit.Result{}, text.Error(QuestionMissing)
	}
	var player *protocol.RoomPlayer
	for i := range ctx.Players {
		if ctx.Players[i].ID == ctx.ClientPlayerID {
			player = &ctx.Players[i]
			break
		}
	}
	if player == nil {
		return gamekit.Result{}, text.Error(text.PlayerMissing)
	}
	if player.IsHost {
		return gamekit.Result{}, text.Error(HostDoesNotAnswer)
	}
	for _, item := range payload.Submissions {
		if item.PlayerID == player.ID {
			return gamekit.Result{}, text.Error(AlreadyAnswered)
		}
	}
	if skipped {
		payload.Submissions = append(payload.Submissions, Submission{
			PlayerID:  player.ID,
			AnswerIDs: []string{},
			Text:      "",
			Skipped:   true,
		})
		if everyoneSubmitted(*question, ctx.Players, payload.Submissions) {
			return revealRound(payload, ctx.Scores, ctx.Players)
		}
		return gamekit.Result{Payload: payload}, nil
	}

	kind := questionKind(*question)
	unique := uniqueStrings(answerIDs)
	trimmed := strings.TrimSpace(answerText)
	if kind == "free" {
		if trimmed == "" {
			return gamekit.Result{}, text.Error(EnterAnswer)
		}
	} else {
		if len(unique) == 0 {
			return gamekit.Result{}, text.Error(PickAnswer)
		}
		if kind == "single" && len(unique) != 1 {
			return gamekit.Result{}, text.Error(PickOneAnswer)
		}
		if selectedAllAnswers(*question, unique) {
			return gamekit.Result{}, text.Error(CannotPickAll)
		}
		for _, id := range unique {
			if !hasAnswer(*question, id) {
				return gamekit.Result{}, text.Error(AnswerMissing)
			}
		}
	}
	submission := Submission{PlayerID: player.ID, AnswerIDs: []string{}, Text: ""}
	if kind == "free" {
		submission.Text = trimmed
	} else {
		submission.AnswerIDs = unique
	}
	payload.Submissions = append(payload.Submissions, submission)
	if everyoneSubmitted(*question, ctx.Players, payload.Submissions) {
		return revealRound(payload, ctx.Scores, ctx.Players)
	}
	return gamekit.Result{Payload: payload}, nil
}

func awardFree(payload Payload, ctx gamekit.Context, questionID string, playerIDs []string) (gamekit.Result, error) {
	if !ctx.IsHost {
		return gamekit.Result{}, text.Error(HostAwards)
	}
	if ctx.Phase != "question" || payload.CurrentQuestionID == nil || *payload.CurrentQuestionID != questionID {
		return gamekit.Result{}, text.Error(WrongQuestion)
	}
	if !payload.Revealed {
		return gamekit.Result{}, text.Error(WaitForAnswers)
	}
	if payload.Awarded {
		return gamekit.Result{}, text.Error(AlreadyAwarded)
	}
	question := findQuestion(payload.Bank, *payload.CurrentQuestionID)
	if question == nil || questionKind(*question) != "free" {
		return gamekit.Result{}, text.Error(NotFreeQuestion)
	}
	chosen := map[string]bool{}
	for _, playerID := range playerIDs {
		for _, player := range ctx.Players {
			if player.ID == playerID && !player.IsHost {
				chosen[playerID] = true
			}
		}
	}
	roundScores := map[string]int{}
	nextScores := map[string]int{}
	for id, value := range ctx.Scores {
		nextScores[id] = value
	}
	for _, submission := range payload.Submissions {
		if !chosen[submission.PlayerID] {
			continue
		}
		roundScores[submission.PlayerID] = question.Value
		nextScores[submission.PlayerID] = nextScores[submission.PlayerID] + question.Value
	}
	payload.RoundScores = roundScores
	payload.Awarded = true
	return gamekit.Result{
		Payload: payload,
		Scores:  nextScores,
		Notices: []protocol.Notice{{Kind: "awarded", Value: &question.Value}},
	}, nil
}

func revealRound(payload Payload, scores map[string]int, players []protocol.RoomPlayer) (gamekit.Result, error) {
	if payload.Revealed {
		return gamekit.Result{Payload: payload, Scores: scores}, nil
	}
	payload.Revealed = true
	var question *Question
	if payload.CurrentQuestionID != nil {
		question = findQuestion(payload.Bank, *payload.CurrentQuestionID)
	}
	if question == nil {
		return gamekit.Result{Payload: payload, Scores: scores, Notices: []protocol.Notice{{Kind: "revealed"}}}, nil
	}
	if !contains(payload.AnsweredQuestionIDs, question.ID) {
		payload.AnsweredQuestionIDs = append(payload.AnsweredQuestionIDs, question.ID)
	}
	nextScores := map[string]int{}
	for id, value := range scores {
		nextScores[id] = value
	}
	if questionKind(*question) != "free" {
		roundScores := map[string]int{}
		for _, submission := range payload.Submissions {
			respondent := findPlayer(players, submission.PlayerID)
			if respondent != nil && respondent.IsHost {
				continue
			}
			points := scoreSubmission(*question, submission)
			roundScores[submission.PlayerID] = points
			if points != 0 {
				nextScores[submission.PlayerID] = nextScores[submission.PlayerID] + points
			}
		}
		payload.RoundScores = roundScores
		payload.Awarded = true
	}
	return gamekit.Result{Payload: payload, Scores: nextScores, Notices: []protocol.Notice{{Kind: "revealed"}}}, nil
}

func finishIfComplete(payload *Payload, players []protocol.RoomPlayer) string {
	ids := make([]string, 0, len(payload.Bank.Questions))
	for _, question := range payload.Bank.Questions {
		ids = append(ids, question.ID)
	}
	phase := "board"
	if len(ids) > 0 && every(ids, payload.AnsweredQuestionIDs) {
		phase = "results"
	}
	played := payload.CurrentQuestionID != nil && contains(payload.AnsweredQuestionIDs, *payload.CurrentQuestionID)
	if played {
		next := chooser.NextChooserID(players, stringOrEmpty(payload.ChooserID))
		if next == "" {
			payload.ChooserID = nil
		} else {
			payload.ChooserID = &next
		}
	}
	payload.CurrentQuestionID = nil
	payload.Answers = []Answer{}
	resetRound(payload)
	return phase
}

func resetRound(payload *Payload) {
	payload.Submissions = []Submission{}
	payload.Revealed = false
	payload.Awarded = false
	payload.RoundScores = map[string]int{}
}

func emptyPayload(bank Bank) Payload {
	return Payload{
		Bank:                bank,
		ChooserID:           nil,
		AnsweredQuestionIDs: []string{},
		CurrentQuestionID:   nil,
		Answers:             []Answer{},
		Submissions:         []Submission{},
		Revealed:            false,
		Awarded:             false,
		RoundScores:         map[string]int{},
	}
}

func asPayload(value any) (Payload, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return Payload{}, text.Error(BadState)
	}
	var payload Payload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return Payload{}, text.Error(BadState)
	}
	if payload.RoundScores == nil {
		payload.RoundScores = map[string]int{}
	}
	if payload.AnsweredQuestionIDs == nil {
		payload.AnsweredQuestionIDs = []string{}
	}
	if payload.Answers == nil {
		payload.Answers = []Answer{}
	}
	if payload.Submissions == nil {
		payload.Submissions = []Submission{}
	}
	return payload, nil
}

func questionKind(question Question) string {
	if question.Kind != "" {
		return question.Kind
	}
	correct := 0
	for _, answer := range question.Answers {
		if answer.IsCorrect {
			correct++
		}
	}
	if len(question.Answers) <= 1 {
		return "free"
	}
	if correct > 1 {
		return "multi"
	}
	return "single"
}

func selectedAllAnswers(question Question, answerIDs []string) bool {
	return questionKind(question) == "multi" && len(question.Answers) > 1 && len(answerIDs) == len(question.Answers)
}

func scoreSubmission(question Question, submission Submission) int {
	if submission.Skipped {
		return 0
	}
	kind := questionKind(question)
	if kind == "free" || selectedAllAnswers(question, submission.AnswerIDs) {
		return 0
	}
	var correctIDs []string
	for _, answer := range question.Answers {
		if answer.IsCorrect {
			correctIDs = append(correctIDs, answer.ID)
		}
	}
	if len(correctIDs) == 0 {
		return 0
	}
	if kind == "single" {
		if len(submission.AnswerIDs) > 0 && contains(correctIDs, submission.AnswerIDs[0]) {
			return question.Value
		}
		return 0
	}
	hits := 0
	for _, id := range submission.AnswerIDs {
		if contains(correctIDs, id) {
			hits++
		}
	}
	return int(math.Round(float64(question.Value*hits) / float64(len(correctIDs))))
}

func expectedRespondents(players []protocol.RoomPlayer) []protocol.RoomPlayer {
	out := []protocol.RoomPlayer{}
	for _, player := range players {
		if player.Connected && !player.IsHost {
			out = append(out, player)
		}
	}
	return out
}

func everyoneSubmitted(question Question, players []protocol.RoomPlayer, submissions []Submission) bool {
	expected := expectedRespondents(players)
	if len(expected) == 0 {
		return false
	}
	submitted := map[string]bool{}
	for _, item := range submissions {
		submitted[item.PlayerID] = true
	}
	for _, player := range expected {
		if !submitted[player.ID] {
			return false
		}
	}
	return true
}

func findQuestion(bank Bank, id string) *Question {
	for i := range bank.Questions {
		if bank.Questions[i].ID == id {
			return &bank.Questions[i]
		}
	}
	return nil
}

func findPlayer(players []protocol.RoomPlayer, id string) *protocol.RoomPlayer {
	for i := range players {
		if players[i].ID == id {
			return &players[i]
		}
	}
	return nil
}

func hasAnswer(question Question, id string) bool {
	for _, answer := range question.Answers {
		if answer.ID == id {
			return true
		}
	}
	return false
}

func shuffleAnswers(answers []Answer) []Answer {
	out := append([]Answer{}, answers...)
	rand.Shuffle(len(out), func(i, j int) { out[i], out[j] = out[j], out[i] })
	return out
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}

func every(required, have []string) bool {
	for _, id := range required {
		if !contains(have, id) {
			return false
		}
	}
	return true
}

func uniqueStrings(values []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, value := range values {
		if seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func stringOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
