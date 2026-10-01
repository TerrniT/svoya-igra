package platforms

import (
	"encoding/json"
	"math/rand/v2"
	"time"

	"svoya-igra/internal/gamekit"
	"svoya-igra/internal/protocol"
	"svoya-igra/internal/text"
)

const (
	gridSize      = 3
	platformCount = 9
	statusMove    = "move"
	statusWarning = "warning"
	statusShove   = "shove"
)

var startSeats = []int{0, 8, 2, 6, 4, 1, 7, 3, 5}

type Payload struct {
	Order      []string       `json:"order"`
	Living     []string       `json:"living"`
	Eliminated []string       `json:"eliminated"`
	Positions  map[string]int `json:"positions"`
	TurnID     string         `json:"turnId"`
	Moved      []string       `json:"moved"`
	Status     string         `json:"status"`
	Marked     []int          `json:"marked"`
	Present    []bool         `json:"present"`
	Round      int            `json:"round"`
	Seed       int64          `json:"seed"`
	WinnerID   string         `json:"winnerId"`
}

type Driver struct{}

func (Driver) CreatePayload(_ json.RawMessage) (any, error) {
	return emptyPayload(), nil
}

func (Driver) InitialPhase() string { return "lobby" }

func (Driver) CanStart(players []protocol.RoomPlayer, _ any, settings json.RawMessage) error {
	if len(players) < MinPlayers {
		return text.Error(NeedPlayers)
	}
	if len(players) > playerCap(settings) {
		return text.Error(TooManyPlayers)
	}
	return nil
}

func (d Driver) Reduce(raw json.RawMessage, ctx gamekit.Context) (gamekit.Result, error) {
	payload, err := asPayload(ctx.Payload)
	if err != nil {
		return gamekit.Result{}, err
	}
	var msg struct {
		Type     string `json:"type"`
		To       int    `json:"to"`
		PlayerID string `json:"playerId"`
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
		next := openRound(ctx.Players)
		scores := map[string]int{}
		for _, player := range ctx.Players {
			scores[player.ID] = 0
		}
		started := time.Now().UTC().Format(time.RFC3339Nano)
		return gamekit.Result{
			Phase:     gamekit.Ptr("play"),
			Payload:   next,
			Scores:    scores,
			StartedAt: gamekit.SetStartedAt(&started),
		}, nil
	}

	if ctx.Phase != "play" {
		return gamekit.Result{}, text.Error(text.GameNotStarted)
	}

	if done := finishIfWon(&payload, ctx.Players); done != nil {
		return *done, nil
	}

	switch msg.Type {
	case "push":
		if payload.Status != statusMove {
			return gamekit.Result{}, text.Error(MustPush)
		}
		if ctx.ClientPlayerID != payload.TurnID {
			return gamekit.Result{}, text.Error(OtherPlayersTurn)
		}
		if err := applyPush(&payload, ctx.ClientPlayerID, msg.To); err != nil {
			return gamekit.Result{}, err
		}
		return afterMove(payload, ctx.Players)

	case "shove":
		if payload.Status != statusShove {
			return gamekit.Result{}, text.Error(BadShove)
		}
		if ctx.ClientPlayerID != payload.TurnID {
			return gamekit.Result{}, text.Error(OtherPlayersTurn)
		}
		if err := applyShove(&payload, ctx.ClientPlayerID, msg.PlayerID); err != nil {
			return gamekit.Result{}, err
		}
		if done := finishIfWon(&payload, ctx.Players); done != nil {
			return *done, nil
		}
		payload.TurnID = nextLiving(payload, payload.TurnID)
		return gamekit.Result{Payload: payload, Scores: scoreTable(payload, ctx.Players)}, nil

	case "vanish":
		if !ctx.IsHost {
			return gamekit.Result{}, text.Error(HostVanishes)
		}
		if payload.Status != statusWarning {
			return gamekit.Result{}, text.Error(NotWarning)
		}
		applyVanish(&payload)
		if done := finishIfWon(&payload, ctx.Players); done != nil {
			return *done, nil
		}
		beginNextRound(&payload)
		return gamekit.Result{Payload: payload, Scores: scoreTable(payload, ctx.Players)}, nil

	case "skipTurn":
		if !ctx.IsHost {
			return gamekit.Result{}, text.Error(HostSkipsTurn)
		}
		if payload.Status == statusWarning {
			return gamekit.Result{}, text.Error(CannotSkipNow)
		}
		if payload.TurnID == "" {
			return gamekit.Result{}, text.Error(CannotSkipNow)
		}
		if payload.Status == statusShove {
			payload.TurnID = nextLiving(payload, payload.TurnID)
			return gamekit.Result{Payload: payload, Scores: scoreTable(payload, ctx.Players)}, nil
		}
		if err := stay(&payload, payload.TurnID); err != nil {
			return gamekit.Result{}, err
		}
		return afterMove(payload, ctx.Players)

	case "resolve":
		if !ctx.IsHost {
			return gamekit.Result{}, text.Error(HostContinues)
		}
		if done := finishIfWon(&payload, ctx.Players); done != nil {
			return *done, nil
		}
		return gamekit.Result{Payload: payload, Scores: scoreTable(payload, ctx.Players)}, nil
	}

	return gamekit.Result{}, text.Error(UnknownMessage)
}

func (Driver) ToClientPayload(payload any, _ string, _ gamekit.Viewer) (any, error) {
	return asPayload(payload)
}

func (Driver) OnPlayerRemoved(payload any, playerID string) (any, error) {
	state, err := asPayload(payload)
	if err != nil {
		return payload, err
	}
	wasTurn := state.TurnID == playerID
	state.Order = filter(state.Order, playerID)
	state.Living = filter(state.Living, playerID)
	state.Eliminated = filter(state.Eliminated, playerID)
	state.Moved = filter(state.Moved, playerID)
	delete(state.Positions, playerID)
	if state.WinnerID == playerID {
		state.WinnerID = ""
	}
	if wasTurn {
		state.TurnID = nextLiving(state, playerID)
	}
	if len(state.Living) == 1 {
		state.WinnerID = state.Living[0]
	}
	if len(state.Living) <= 1 && state.Status == statusWarning {
		state.Status = statusMove
		state.Marked = []int{}
	}
	return state, nil
}

func (Driver) AfterDisconnect(payload any, players []protocol.RoomPlayer, _ map[string]int) *gamekit.Result {
	state, err := asPayload(payload)
	if err != nil {
		return nil
	}
	return finishIfWon(&state, players)
}

func emptyPayload() Payload {
	return Payload{
		Order:      []string{},
		Living:     []string{},
		Eliminated: []string{},
		Positions:  map[string]int{},
		Moved:      []string{},
		Status:     statusMove,
		Marked:     []int{},
		Present:    fullBoard(),
		Round:      0,
	}
}

func openRound(players []protocol.RoomPlayer) Payload {
	order := make([]string, 0, len(players))
	living := make([]string, 0, len(players))
	positions := map[string]int{}
	for i, player := range players {
		order = append(order, player.ID)
		living = append(living, player.ID)
		positions[player.ID] = startSeats[i%len(startSeats)]
	}
	turnID := ""
	if len(order) > 0 {
		turnID = order[0]
	}
	return Payload{
		Order:      order,
		Living:     living,
		Eliminated: []string{},
		Positions:  positions,
		TurnID:     turnID,
		Moved:      []string{},
		Status:     statusMove,
		Marked:     []int{},
		Present:    fullBoard(),
		Round:      1,
		Seed:       time.Now().UnixNano(),
	}
}

func applyPush(payload *Payload, playerID string, to int) error {
	if !contains(payload.Living, playerID) {
		return text.Error(PlayerGone)
	}
	if contains(payload.Moved, playerID) {
		return text.Error(AlreadyMoved)
	}
	from, ok := payload.Positions[playerID]
	if !ok {
		return text.Error(PlayerGone)
	}
	targets := legalPushTargets(*payload, playerID)
	if len(targets) == 0 {
		if to != from {
			return text.Error(NeedAdjacent)
		}
		return stay(payload, playerID)
	}
	if !containsInt(targets, to) {
		if to < 0 || to >= platformCount || !payload.Present[to] {
			return text.Error(PlatformGone)
		}
		if !adjacent(from, to) {
			return text.Error(NeedAdjacent)
		}
		return text.Error(BadPlatform)
	}
	payload.Positions[playerID] = to
	payload.Moved = append(payload.Moved, playerID)
	return nil
}

func stay(payload *Payload, playerID string) error {
	if !contains(payload.Living, playerID) {
		return text.Error(PlayerGone)
	}
	if contains(payload.Moved, playerID) {
		return text.Error(AlreadyMoved)
	}
	payload.Moved = append(payload.Moved, playerID)
	return nil
}

func applyShove(payload *Payload, actorID, targetID string) error {
	if presentCount(*payload) != 1 {
		return text.Error(BadShove)
	}
	if !contains(payload.Living, actorID) || !contains(payload.Living, targetID) {
		return text.Error(PlayerGone)
	}
	if actorID == targetID {
		return text.Error(BadShove)
	}
	if payload.Positions[actorID] != payload.Positions[targetID] {
		return text.Error(BadShove)
	}
	eliminate(payload, targetID)
	return nil
}

func afterMove(payload Payload, players []protocol.RoomPlayer) (gamekit.Result, error) {
	if !allLivingMoved(payload) {
		payload.TurnID = nextUnmoved(payload)
		return gamekit.Result{Payload: payload, Scores: scoreTable(payload, players)}, nil
	}
	if presentCount(payload) <= 1 {
		payload.Status = statusShove
		payload.Moved = []string{}
		payload.Marked = []int{}
		payload.TurnID = nextLiving(payload, payload.TurnID)
		return gamekit.Result{Payload: payload, Scores: scoreTable(payload, players)}, nil
	}
	payload.Marked = pickMarked(payload)
	payload.Status = statusWarning
	return gamekit.Result{Payload: payload, Scores: scoreTable(payload, players)}, nil
}

func applyVanish(payload *Payload) {
	for _, cell := range payload.Marked {
		if cell >= 0 && cell < platformCount {
			payload.Present[cell] = false
		}
	}
	fallen := []string{}
	for _, id := range payload.Living {
		pos, ok := payload.Positions[id]
		if !ok || pos < 0 || pos >= platformCount || !payload.Present[pos] {
			fallen = append(fallen, id)
		}
	}
	for _, id := range fallen {
		eliminate(payload, id)
	}
	payload.Marked = []int{}
}

func beginNextRound(payload *Payload) {
	payload.Round++
	payload.Moved = []string{}
	if presentCount(*payload) <= 1 && len(payload.Living) >= 2 {
		payload.Status = statusShove
	} else {
		payload.Status = statusMove
	}
	if payload.TurnID == "" || !contains(payload.Living, payload.TurnID) {
		payload.TurnID = firstLiving(*payload)
		return
	}
	payload.TurnID = nextLiving(*payload, payload.TurnID)
}

func eliminate(payload *Payload, playerID string) {
	payload.Living = filter(payload.Living, playerID)
	payload.Moved = filter(payload.Moved, playerID)
	if !contains(payload.Eliminated, playerID) {
		payload.Eliminated = append(payload.Eliminated, playerID)
	}
}

func finishIfWon(payload *Payload, players []protocol.RoomPlayer) *gamekit.Result {
	living := livingInRoom(*payload, players)
	payload.Living = living
	if len(living) == 1 {
		payload.WinnerID = living[0]
		payload.Status = statusMove
		payload.Marked = []int{}
		return &gamekit.Result{
			Phase:   gamekit.Ptr("results"),
			Payload: *payload,
			Scores:  scoreTable(*payload, players),
		}
	}
	if len(living) == 0 && payload.WinnerID != "" {
		return &gamekit.Result{
			Phase:   gamekit.Ptr("results"),
			Payload: *payload,
			Scores:  scoreTable(*payload, players),
		}
	}
	return nil
}

func legalPushTargets(payload Payload, playerID string) []int {
	from, ok := payload.Positions[playerID]
	if !ok {
		return nil
	}
	out := []int{}
	for to := 0; to < platformCount; to++ {
		if to == from || !payload.Present[to] || !adjacent(from, to) {
			continue
		}
		out = append(out, to)
	}
	return out
}

func pickMarked(payload Payload) []int {
	count := vanishCount(presentCount(payload))
	if count <= 0 {
		return []int{}
	}
	present := presentCells(payload)
	livingCells := map[int]int{}
	for _, id := range payload.Living {
		livingCells[payload.Positions[id]]++
	}
	empty := []int{}
	occupiedSafe := []int{}
	for _, cell := range present {
		if livingCells[cell] == 0 {
			empty = append(empty, cell)
			continue
		}
		if livingCells[cell] < len(payload.Living) {
			occupiedSafe = append(occupiedSafe, cell)
		}
	}
	rng := rand.New(rand.NewPCG(uint64(payload.Seed), uint64(payload.Round)+1))
	shuffleInts(rng, empty)
	shuffleInts(rng, occupiedSafe)
	pool := append(empty, occupiedSafe...)
	if len(pool) == 0 {
		// Everyone stacked and no spare tile: keep the last island.
		return []int{}
	}
	if count > len(pool) {
		count = len(pool)
	}
	if count >= presentCount(payload) {
		count = presentCount(payload) - 1
	}
	if count <= 0 {
		return []int{}
	}
	return append([]int{}, pool[:count]...)
}

func vanishCount(remaining int) int {
	if remaining <= 1 {
		return 0
	}
	if remaining >= 6 {
		if remaining-1 < 2 {
			return remaining - 1
		}
		return 2
	}
	return 1
}

func scoreTable(payload Payload, players []protocol.RoomPlayer) map[string]int {
	scores := map[string]int{}
	for _, player := range players {
		if player.ID == payload.WinnerID {
			scores[player.ID] = 1
		} else {
			scores[player.ID] = 0
		}
	}
	return scores
}

func livingInRoom(payload Payload, players []protocol.RoomPlayer) []string {
	out := []string{}
	for _, id := range payload.Living {
		for _, player := range players {
			if player.ID == id {
				out = append(out, id)
				break
			}
		}
	}
	return out
}

func allLivingMoved(payload Payload) bool {
	for _, id := range payload.Living {
		if !contains(payload.Moved, id) {
			return false
		}
	}
	return len(payload.Living) > 0
}

func nextUnmoved(payload Payload) string {
	if payload.TurnID == "" {
		return firstUnmoved(payload)
	}
	start := indexOf(payload.Order, payload.TurnID)
	if start < 0 {
		start = 0
	}
	for step := 1; step <= len(payload.Order); step++ {
		id := payload.Order[(start+step)%len(payload.Order)]
		if contains(payload.Living, id) && !contains(payload.Moved, id) {
			return id
		}
	}
	return firstLiving(payload)
}

func nextLiving(payload Payload, after string) string {
	start := indexOf(payload.Order, after)
	if start < 0 {
		return firstLiving(payload)
	}
	for step := 1; step <= len(payload.Order); step++ {
		id := payload.Order[(start+step)%len(payload.Order)]
		if contains(payload.Living, id) {
			return id
		}
	}
	return firstLiving(payload)
}

func firstLiving(payload Payload) string {
	for _, id := range payload.Order {
		if contains(payload.Living, id) {
			return id
		}
	}
	if len(payload.Living) > 0 {
		return payload.Living[0]
	}
	return ""
}

func firstUnmoved(payload Payload) string {
	for _, id := range payload.Order {
		if contains(payload.Living, id) && !contains(payload.Moved, id) {
			return id
		}
	}
	return firstLiving(payload)
}

func presentCount(payload Payload) int {
	n := 0
	for _, ok := range payload.Present {
		if ok {
			n++
		}
	}
	return n
}

func presentCells(payload Payload) []int {
	out := []int{}
	for i, ok := range payload.Present {
		if ok {
			out = append(out, i)
		}
	}
	return out
}

func adjacent(a, b int) bool {
	if a == b || a < 0 || b < 0 || a >= platformCount || b >= platformCount {
		return false
	}
	ar, ac := a/gridSize, a%gridSize
	br, bc := b/gridSize, b%gridSize
	dr := ar - br
	if dr < 0 {
		dr = -dr
	}
	dc := ac - bc
	if dc < 0 {
		dc = -dc
	}
	return dr <= 1 && dc <= 1
}

func fullBoard() []bool {
	out := make([]bool, platformCount)
	for i := range out {
		out[i] = true
	}
	return out
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
	if payload.Order == nil {
		payload.Order = []string{}
	}
	if payload.Living == nil {
		payload.Living = []string{}
	}
	if payload.Eliminated == nil {
		payload.Eliminated = []string{}
	}
	if payload.Positions == nil {
		payload.Positions = map[string]int{}
	}
	if payload.Moved == nil {
		payload.Moved = []string{}
	}
	if payload.Marked == nil {
		payload.Marked = []int{}
	}
	payload.Present = normalizePresent(payload.Present)
	if payload.Status == "" {
		payload.Status = statusMove
	}
	return payload, nil
}

func normalizePresent(present []bool) []bool {
	out := fullBoard()
	if len(present) == 0 {
		return out
	}
	for i := 0; i < platformCount && i < len(present); i++ {
		out[i] = present[i]
	}
	return out
}

func playerCap(settings json.RawMessage) int {
	parsed, _ := gamekit.DecodeSettings[Settings](settings)
	if parsed.MaxPlayers > 0 && parsed.MaxPlayers <= MaxPlayers {
		return parsed.MaxPlayers
	}
	return MaxPlayers
}

func contains(ids []string, value string) bool {
	for _, id := range ids {
		if id == value {
			return true
		}
	}
	return false
}

func containsInt(ids []int, value int) bool {
	for _, id := range ids {
		if id == value {
			return true
		}
	}
	return false
}

func filter(ids []string, drop string) []string {
	out := []string{}
	for _, id := range ids {
		if id != drop {
			out = append(out, id)
		}
	}
	return out
}

func indexOf(ids []string, value string) int {
	for i, id := range ids {
		if id == value {
			return i
		}
	}
	return -1
}

func shuffleInts(rng *rand.Rand, items []int) {
	rng.Shuffle(len(items), func(i, j int) {
		items[i], items[j] = items[j], items[i]
	})
}
