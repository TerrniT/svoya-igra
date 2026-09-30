package golf

import (
	"encoding/json"
	"math"
	"time"

	"svoya-igra/internal/gamekit"
	"svoya-igra/internal/protocol"
	"svoya-igra/internal/text"
)

const maxStrokes = 8

type Vec struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

type Payload struct {
	LevelIndex int              `json:"levelIndex"`
	Order      []string         `json:"order"`
	TurnID     string           `json:"turnId"`
	Strokes    map[string]int   `json:"strokes"`
	Totals     map[string]int   `json:"totals"`
	Cards      map[string][]int `json:"cards"`
	Done       []string         `json:"done"`
	Status     string           `json:"status"`
	Lie        Vec              `json:"lie"`
	Ball       Vec              `json:"ball"`
	Velocity   Vec              `json:"velocity"`
	Shot       int              `json:"shot"`
	Yaw        float64          `json:"yaw"`
	Power      float64          `json:"power"`
	Note       string           `json:"note"`
}

type level struct {
	tee        Vec
	hole       Vec
	holeRadius float64
}

var levels = []level{
	{tee: Vec{X: 0, Y: 0.2, Z: 1.15}, hole: Vec{X: 0, Y: 0, Z: 11.6}, holeRadius: 0.4},
	{tee: Vec{X: 0, Y: 0.2, Z: 0.85}, hole: Vec{X: 7.1, Y: 0, Z: 8.4}, holeRadius: 0.4},
	{tee: Vec{X: 0, Y: 0.2, Z: 1}, hole: Vec{X: 0, Y: 1.2, Z: 13.6}, holeRadius: 0.42},
	{tee: Vec{X: 0, Y: 0.2, Z: 1.15}, hole: Vec{X: 0, Y: 0, Z: 13.4}, holeRadius: 0.4},
	{tee: Vec{X: 0, Y: 0.2, Z: 1.15}, hole: Vec{X: 1.05, Y: 0, Z: 12.7}, holeRadius: 0.4},
}

type Driver struct{}

func (Driver) CreatePayload(_ json.RawMessage) (any, error) {
	return emptyPayload(), nil
}

func (Driver) InitialPhase() string { return "lobby" }

func (Driver) CanStart(players []protocol.RoomPlayer, _ any, settings json.RawMessage) error {
	if len(players) < 1 {
		return text.Error(text.NeedOnePlayer)
	}
	if overPlayerCap(players, settings) {
		return text.Error(MaxPlayers)
	}
	return nil
}

func (d Driver) Reduce(raw json.RawMessage, ctx gamekit.Context) (gamekit.Result, error) {
	payload, err := asPayload(ctx.Payload)
	if err != nil {
		return gamekit.Result{}, err
	}
	var msg struct {
		Type   string  `json:"type"`
		Yaw    float64 `json:"yaw"`
		Power  float64 `json:"power"`
		Shot   int     `json:"shot"`
		X      float64 `json:"x"`
		Y      float64 `json:"y"`
		Z      float64 `json:"z"`
		VX     float64 `json:"vx"`
		VY     float64 `json:"vy"`
		VZ     float64 `json:"vz"`
		Holed  bool    `json:"holed"`
		Hazard bool    `json:"hazard"`
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
		order := make([]string, 0, len(ctx.Players))
		scores := map[string]int{}
		for _, player := range ctx.Players {
			order = append(order, player.ID)
			scores[player.ID] = 0
		}
		next := openHole(0, order, map[string][]int{}, map[string]int{}, 0)
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

	switch msg.Type {
	case "putt":
		if payload.Status != "aim" {
			return gamekit.Result{}, text.Error(BallInPlay)
		}
		if ctx.ClientPlayerID != payload.TurnID {
			return gamekit.Result{}, text.Error(OtherPlayersTurn)
		}
		strokes := payload.Strokes[payload.TurnID] + 1
		if strokes > strokeCap(ctx.Settings) {
			return gamekit.Result{}, text.Error(StrokeLimit)
		}
		yaw, err := readAngle(msg.Yaw)
		if err != nil {
			return gamekit.Result{}, err
		}
		power, err := readPower(msg.Power)
		if err != nil {
			return gamekit.Result{}, err
		}
		payload.Strokes[payload.TurnID] = strokes
		payload.Yaw = yaw
		payload.Power = power
		payload.Shot++
		payload.Status = "roll"
		payload.Note = ""
		payload.Velocity = Vec{}
		return gamekit.Result{Payload: payload, Scores: scoreTable(payload, ctx.Players)}, nil

	case "ball":
		if !ctx.IsHost {
			return gamekit.Result{}, text.Error(HostReportsBall)
		}
		if payload.Status != "roll" || msg.Shot != payload.Shot {
			return gamekit.Result{Volatile: true}, nil
		}
		x, y, z, err := readVec(msg.X, msg.Y, msg.Z)
		if err != nil {
			return gamekit.Result{}, err
		}
		vx, vy, vz, err := readVec(msg.VX, msg.VY, msg.VZ)
		if err != nil {
			return gamekit.Result{}, err
		}
		payload.Ball = Vec{X: x, Y: y, Z: z}
		payload.Velocity = Vec{X: vx, Y: vy, Z: vz}
		return gamekit.Result{Payload: payload, Volatile: true}, nil

	case "settle":
		if !ctx.IsHost {
			return gamekit.Result{}, text.Error(HostReportsShot)
		}
		if payload.Status != "roll" || msg.Shot != payload.Shot {
			return gamekit.Result{Volatile: true}, nil
		}
		lvl := levelAt(payload.LevelIndex)
		x, y, z, err := readVec(msg.X, msg.Y, msg.Z)
		if err != nil {
			return gamekit.Result{}, err
		}
		pos := Vec{X: x, Y: y, Z: z}
		holeDist := math.Hypot(pos.X-lvl.hole.X, pos.Z-lvl.hole.Z)
		holed := msg.Holed && holeDist <= lvl.holeRadius+0.25
		hazard := msg.Hazard || pos.Y < -0.45
		if holed {
			payload.Ball = Vec{X: lvl.hole.X, Y: lvl.hole.Y + 0.05, Z: lvl.hole.Z}
			markDone(&payload, "hole")
			return gamekit.Result{Payload: payload, Scores: scoreTable(payload, ctx.Players)}, nil
		}
		if hazard {
			payload.Ball = payload.Lie
			payload.Velocity = Vec{}
			payload.Note = "water"
			if payload.Strokes[payload.TurnID] >= strokeCap(ctx.Settings) {
				payload.Strokes[payload.TurnID] = strokeCap(ctx.Settings)
				markDone(&payload, "pickup")
				return gamekit.Result{Payload: payload, Scores: scoreTable(payload, ctx.Players)}, nil
			}
			payload.Status = "aim"
			return gamekit.Result{Payload: payload, Scores: scoreTable(payload, ctx.Players)}, nil
		}
		payload.Ball = pos
		payload.Lie = pos
		payload.Velocity = Vec{}
		payload.Note = ""
		if payload.Strokes[payload.TurnID] >= strokeCap(ctx.Settings) {
			payload.Strokes[payload.TurnID] = strokeCap(ctx.Settings)
			markDone(&payload, "pickup")
			return gamekit.Result{Payload: payload, Scores: scoreTable(payload, ctx.Players)}, nil
		}
		payload.Status = "aim"
		return gamekit.Result{Payload: payload, Scores: scoreTable(payload, ctx.Players)}, nil

	case "continue":
		if !ctx.IsHost {
			return gamekit.Result{}, text.Error(HostContinues)
		}
		if payload.Status != "sunk" {
			return gamekit.Result{}, text.Error(HoleNotClosed)
		}
		if armNext(&payload) {
			return gamekit.Result{Payload: payload, Scores: scoreTable(payload, ctx.Players)}, nil
		}
		return foldHole(payload, ctx.Players)

	case "skipTurn":
		if !ctx.IsHost {
			return gamekit.Result{}, text.Error(HostSkipsTurn)
		}
		if payload.Status == "roll" {
			return gamekit.Result{}, text.Error(WaitBallStop)
		}
		if payload.Status == "sunk" {
			return gamekit.Result{}, text.Error(TurnAlreadyDone)
		}
		payload.Strokes[payload.TurnID] = strokeCap(ctx.Settings)
		markDone(&payload, "pickup")
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
	state.Order = filter(state.Order, playerID)
	delete(state.Strokes, playerID)
	delete(state.Totals, playerID)
	delete(state.Cards, playerID)
	state.Done = filter(state.Done, playerID)
	if state.TurnID != playerID {
		return state, nil
	}
	state.Shot++
	state.Velocity = Vec{}
	next := ""
	for _, id := range state.Order {
		if !contains(state.Done, id) {
			next = id
			break
		}
	}
	if next == "" {
		state.Status = "sunk"
		state.Note = "pickup"
		if len(state.Order) > 0 {
			state.TurnID = state.Order[0]
		} else {
			state.TurnID = ""
		}
		return state, nil
	}
	tee := levelAt(state.LevelIndex).tee
	state.TurnID = next
	state.Status = "aim"
	state.Note = ""
	state.Ball = tee
	state.Lie = tee
	return state, nil
}

func (Driver) AfterDisconnect(any, []protocol.RoomPlayer, map[string]int) *gamekit.Result {
	return nil
}

func emptyPayload() Payload {
	tee := levelAt(0).tee
	return Payload{
		LevelIndex: 0,
		Order:      []string{},
		TurnID:     "",
		Strokes:    map[string]int{},
		Totals:     map[string]int{},
		Cards:      map[string][]int{},
		Done:       []string{},
		Status:     "aim",
		Lie:        tee,
		Ball:       tee,
		Velocity:   Vec{},
		Shot:       0,
		Yaw:        0,
		Power:      0.55,
		Note:       "",
	}
}

func openHole(levelIndex int, order []string, cards map[string][]int, totals map[string]int, shot int) Payload {
	tee := levelAt(levelIndex).tee
	strokes := map[string]int{}
	for _, id := range order {
		strokes[id] = 0
	}
	turnID := ""
	if len(order) > 0 {
		turnID = order[0]
	}
	return Payload{
		LevelIndex: levelIndex,
		Order:      order,
		TurnID:     turnID,
		Strokes:    strokes,
		Totals:     totals,
		Cards:      cards,
		Done:       []string{},
		Status:     "aim",
		Lie:        tee,
		Ball:       tee,
		Velocity:   Vec{},
		Shot:       shot,
		Yaw:        0,
		Power:      0.55,
		Note:       "",
	}
}

func livingOrder(order []string, players []protocol.RoomPlayer) []string {
	ids := []string{}
	for _, id := range order {
		for _, player := range players {
			if player.ID == id {
				ids = append(ids, id)
				break
			}
		}
	}
	for _, player := range players {
		if !contains(ids, player.ID) {
			ids = append(ids, player.ID)
		}
	}
	return ids
}

func scoreTable(payload Payload, players []protocol.RoomPlayer) map[string]int {
	scores := map[string]int{}
	for _, player := range players {
		scores[player.ID] = payload.Totals[player.ID] + payload.Strokes[player.ID]
	}
	return scores
}

func nextPending(payload Payload) string {
	if len(payload.Order) == 0 {
		return ""
	}
	start := 0
	for i, id := range payload.Order {
		if id == payload.TurnID {
			start = i
			break
		}
	}
	for step := 1; step <= len(payload.Order); step++ {
		id := payload.Order[(start+step)%len(payload.Order)]
		if !contains(payload.Done, id) {
			return id
		}
	}
	return ""
}

func markDone(payload *Payload, note string) {
	if payload.TurnID != "" && !contains(payload.Done, payload.TurnID) {
		payload.Done = append(payload.Done, payload.TurnID)
	}
	payload.Status = "sunk"
	payload.Note = note
	payload.Velocity = Vec{}
}

func foldHole(payload Payload, players []protocol.RoomPlayer) (gamekit.Result, error) {
	for _, id := range payload.Order {
		strokes, ok := payload.Strokes[id]
		if !ok {
			strokes = maxStrokes
		}
		payload.Cards[id] = append(append([]int{}, payload.Cards[id]...), strokes)
		payload.Totals[id] = payload.Totals[id] + strokes
	}
	payload.Strokes = map[string]int{}
	order := livingOrder(payload.Order, players)
	if payload.LevelIndex >= len(levels)-1 {
		return gamekit.Result{
			Phase:   gamekit.Ptr("results"),
			Payload: payload,
			Scores:  scoreTable(payload, players),
		}, nil
	}
	next := openHole(payload.LevelIndex+1, order, payload.Cards, payload.Totals, payload.Shot)
	return gamekit.Result{Payload: next, Scores: scoreTable(next, players)}, nil
}

func armNext(payload *Payload) bool {
	next := nextPending(*payload)
	if next == "" {
		return false
	}
	tee := levelAt(payload.LevelIndex).tee
	payload.TurnID = next
	payload.Status = "aim"
	payload.Note = ""
	payload.Ball = tee
	payload.Lie = tee
	payload.Velocity = Vec{}
	return true
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
	if payload.Strokes == nil {
		payload.Strokes = map[string]int{}
	}
	if payload.Totals == nil {
		payload.Totals = map[string]int{}
	}
	if payload.Cards == nil {
		payload.Cards = map[string][]int{}
	}
	if payload.Order == nil {
		payload.Order = []string{}
	}
	if payload.Done == nil {
		payload.Done = []string{}
	}
	return payload, nil
}

func levelAt(index int) level {
	if index < 0 || index >= len(levels) {
		return levels[0]
	}
	return levels[index]
}

func readAngle(value float64) (float64, error) {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, text.Error(BadAim)
	}
	return value, nil
}

func readPower(value float64) (float64, error) {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, text.Error(BadPower)
	}
	if value < 0.02 {
		return 0.02, nil
	}
	if value > 1 {
		return 1, nil
	}
	return value, nil
}

func readCoord(value float64) (float64, error) {
	if math.IsNaN(value) || math.IsInf(value, 0) || math.Abs(value) > 80 {
		return 0, text.Error(BadBallPos)
	}
	return math.Round(value*1000) / 1000, nil
}

func readVec(x, y, z float64) (float64, float64, float64, error) {
	nx, err := readCoord(x)
	if err != nil {
		return 0, 0, 0, err
	}
	ny, err := readCoord(y)
	if err != nil {
		return 0, 0, 0, err
	}
	nz, err := readCoord(z)
	if err != nil {
		return 0, 0, 0, err
	}
	return nx, ny, nz, nil
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

func overPlayerCap(players []protocol.RoomPlayer, settings json.RawMessage) bool {
	parsed, _ := gamekit.DecodeSettings[Settings](settings)
	limit := parsed.MaxPlayers
	if limit <= 0 {
		limit = 8
	}
	return len(players) > limit
}

func strokeCap(settings json.RawMessage) int {
	parsed, _ := gamekit.DecodeSettings[Settings](settings)
	if parsed.MaxStrokes > 0 {
		return parsed.MaxStrokes
	}
	return maxStrokes
}

func contains(ids []string, value string) bool {
	for _, id := range ids {
		if id == value {
			return true
		}
	}
	return false
}
