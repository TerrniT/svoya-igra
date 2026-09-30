package deepquestion

import (
	"encoding/json"
	"math/rand/v2"
	"time"

	"svoya-igra/internal/gamekit"
	"svoya-igra/internal/protocol"
	"svoya-igra/internal/text"
)

type Question struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Category string `json:"category,omitempty"`
}

type Payload struct {
	Questions         []Question `json:"questions"`
	CurrentQuestionID *string    `json:"currentQuestionId"`
	UsedQuestionIDs   []string   `json:"usedQuestionIds"`
}

type Driver struct{}

func (Driver) CreatePayload(settings json.RawMessage) (any, error) {
	parsed, err := gamekit.DecodeSettings[Settings](settings)
	if err != nil {
		return nil, text.Error(BadCollection)
	}
	return Payload{
		Questions:         parsed.Questions,
		CurrentQuestionID: nil,
		UsedQuestionIDs:   []string{},
	}, nil
}

func (Driver) InitialPhase() string { return "lobby" }

func (Driver) CanStart(players []protocol.RoomPlayer, payload any, _ json.RawMessage) error {
	if len(players) == 0 {
		return text.Error(text.NeedOneParticipant)
	}
	state, err := asPayload(payload)
	if err != nil {
		return err
	}
	if len(state.Questions) == 0 {
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
		Type string `json:"type"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		return gamekit.Result{}, text.Error(text.BadMessage)
	}

	if msg.Type == "start" || msg.Type == "playAgain" {
		if !ctx.IsHost {
			return gamekit.Result{}, text.Error(text.HostStarts)
		}
		if err := d.CanStart(ctx.Players, payload, ctx.Settings); err != nil {
			return gamekit.Result{}, err
		}
		payload.CurrentQuestionID = nil
		payload.UsedQuestionIDs = []string{}
		started := time.Now().UTC().Format(time.RFC3339Nano)
		return gamekit.Result{
			Phase:     gamekit.Ptr("play"),
			Payload:   payload,
			StartedAt: gamekit.SetStartedAt(&started),
		}, nil
	}

	if msg.Type == "nextQuestion" {
		if !ctx.IsHost {
			return gamekit.Result{}, text.Error(HostPicksNext)
		}
		if ctx.Phase != "play" {
			return gamekit.Result{}, text.Error(StartFirst)
		}
		next := chooseNext(&payload)
		if next == nil {
			return gamekit.Result{}, text.Error(NoQuestions)
		}
		id := next.ID
		payload.CurrentQuestionID = &id
		if !contains(payload.UsedQuestionIDs, id) {
			payload.UsedQuestionIDs = append(payload.UsedQuestionIDs, id)
		}
		return gamekit.Result{Payload: payload}, nil
	}

	return gamekit.Result{}, text.Error(UnknownMessage)
}

func (Driver) ToClientPayload(payload any, _ string, _ gamekit.Viewer) (any, error) {
	return asPayload(payload)
}

func (Driver) OnPlayerRemoved(payload any, _ string) (any, error) {
	return asPayload(payload)
}

func (Driver) AfterDisconnect(any, []protocol.RoomPlayer, map[string]int) *gamekit.Result {
	return nil
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
	if payload.Questions == nil {
		payload.Questions = []Question{}
	}
	if payload.UsedQuestionIDs == nil {
		payload.UsedQuestionIDs = []string{}
	}
	return payload, nil
}

func chooseNext(payload *Payload) *Question {
	available := []Question{}
	for _, question := range payload.Questions {
		if !contains(payload.UsedQuestionIDs, question.ID) {
			available = append(available, question)
		}
	}
	if len(available) == 0 {
		payload.UsedQuestionIDs = []string{}
		if len(payload.Questions) == 0 {
			return nil
		}
		return &payload.Questions[rand.IntN(len(payload.Questions))]
	}
	pick := available[rand.IntN(len(available))]
	return &pick
}

func contains(ids []string, value string) bool {
	for _, id := range ids {
		if id == value {
			return true
		}
	}
	return false
}
