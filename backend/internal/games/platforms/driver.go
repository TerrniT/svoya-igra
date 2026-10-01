package platforms

import (
	"encoding/json"
	"math"
	"math/rand/v2"
	"time"

	"svoya-igra/internal/gamekit"
	"svoya-igra/internal/protocol"
	"svoya-igra/internal/text"
)

const (
	gridSize      = 3
	platformCount = 9
	spacing       = 2.45
	landRadius    = 1.28
	restY         = 0.38
	hazardY       = -0.45
	statusAim     = "aim"
	statusRoll    = "roll"
	statusWarning = "warning"
)

var startSeats = []int{0, 8, 2, 6, 4, 1, 7, 3, 5}

type Vec struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

type Payload struct {
	Order      []string       `json:"order"`
	Living     []string       `json:"living"`
	Eliminated []string       `json:"eliminated"`
	Cells      map[string]int `json:"cells"`
	Figures    map[string]Vec `json:"figures"`
	TurnID     string         `json:"turnId"`
	Moved      []string       `json:"moved"`
	Status     string         `json:"status"`
	Marked     []int          `json:"marked"`
	Present    []bool         `json:"present"`
	Round      int            `json:"round"`
	Seed       int64          `json:"seed"`
	WinnerID   string         `json:"winnerId"`
	Shot       int            `json:"shot"`
	Yaw        float64        `json:"yaw"`
	Power      float64        `json:"power"`
	Lie        Vec            `json:"lie"`
	Velocity   Vec            `json:"velocity"`
	Note       string         `json:"note"`
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
		Type     string         `json:"type"`
		To       int            `json:"to"`
		PlayerID string         `json:"playerId"`
		Yaw      float64        `json:"yaw"`
		Power    float64        `json:"power"`
		Shot     int            `json:"shot"`
		X        float64        `json:"x"`
		Y        float64        `json:"y"`
		Z        float64        `json:"z"`
		VX       float64        `json:"vx"`
		VY       float64        `json:"vy"`
		VZ       float64        `json:"vz"`
		Hazard   bool           `json:"hazard"`
		Fallen   []string       `json:"fallen"`
		Figures  map[string]Vec `json:"figures"`
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
		if payload.Status != statusAim {
			return gamekit.Result{}, text.Error(MustPush)
		}
		if ctx.ClientPlayerID != payload.TurnID {
			return gamekit.Result{}, text.Error(OtherPlayersTurn)
		}
		if !contains(payload.Living, ctx.ClientPlayerID) {
			return gamekit.Result{}, text.Error(PlayerGone)
		}
		yaw, err := readAngle(msg.Yaw)
		if err != nil {
			return gamekit.Result{}, err
		}
		power, err := readPower(msg.Power)
		if err != nil {
			return gamekit.Result{}, err
		}
		payload.Yaw = yaw
		payload.Power = power
		payload.Shot++
		payload.Status = statusRoll
		payload.Note = ""
		payload.Lie = payload.Figures[payload.TurnID]
		payload.Velocity = Vec{}
		return gamekit.Result{Payload: payload, Scores: scoreTable(payload, ctx.Players)}, nil

	case "figure":
		if !ctx.IsHost {
			return gamekit.Result{}, text.Error(HostReportsFigure)
		}
		if payload.Status != statusRoll || msg.Shot != payload.Shot {
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
		if payload.TurnID != "" {
			payload.Figures[payload.TurnID] = Vec{X: x, Y: y, Z: z}
		}
		payload.Velocity = Vec{X: vx, Y: vy, Z: vz}
		return gamekit.Result{Payload: payload, Volatile: true}, nil

	case "settle":
		if !ctx.IsHost {
			return gamekit.Result{}, text.Error(HostReportsShot)
		}
		if payload.Status != statusRoll || msg.Shot != payload.Shot {
			return gamekit.Result{Volatile: true}, nil
		}
		return settle(payload, ctx.Players, msg.X, msg.Y, msg.Z, msg.Hazard, msg.Fallen, msg.Figures)

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
		if payload.Status == statusWarning || payload.Status == statusRoll {
			return gamekit.Result{}, text.Error(CannotSkipNow)
		}
		if payload.TurnID == "" {
			return gamekit.Result{}, text.Error(CannotSkipNow)
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
	delete(state.Cells, playerID)
	delete(state.Figures, playerID)
	if state.WinnerID == playerID {
		state.WinnerID = ""
	}
	if wasTurn && state.Status == statusRoll {
		state.Status = statusAim
		state.Shot++
		state.Velocity = Vec{}
	}
	if wasTurn {
		state.TurnID = nextLiving(state, playerID)
	}
	if len(state.Living) == 1 {
		state.WinnerID = state.Living[0]
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
		Cells:      map[string]int{},
		Figures:    map[string]Vec{},
		Moved:      []string{},
		Status:     statusAim,
		Marked:     []int{},
		Present:    fullBoard(),
	}
}

func openRound(players []protocol.RoomPlayer) Payload {
	order := make([]string, 0, len(players))
	living := make([]string, 0, len(players))
	cells := map[string]int{}
	figures := map[string]Vec{}
	for i, player := range players {
		seat := startSeats[i%len(startSeats)]
		order = append(order, player.ID)
		living = append(living, player.ID)
		cells[player.ID] = seat
		figures[player.ID] = cellCenter(seat)
	}
	turnID := ""
	if len(order) > 0 {
		turnID = order[0]
	}
	lie := Vec{}
	if turnID != "" {
		lie = figures[turnID]
	}
	return Payload{
		Order:      order,
		Living:     living,
		Eliminated: []string{},
		Cells:      cells,
		Figures:    figures,
		TurnID:     turnID,
		Moved:      []string{},
		Status:     statusAim,
		Marked:     []int{},
		Present:    fullBoard(),
		Round:      1,
		Seed:       time.Now().UnixNano(),
		Lie:        lie,
		Power:      0.55,
	}
}

func settle(payload Payload, players []protocol.RoomPlayer, x, y, z float64, hazard bool, fallen []string, extras map[string]Vec) (gamekit.Result, error) {
	px, py, pz, err := readVec(x, y, z)
	if err != nil {
		return gamekit.Result{}, err
	}
	for id, pos := range extras {
		nx, ny, nz, err := readVec(pos.X, pos.Y, pos.Z)
		if err != nil {
			continue
		}
		payload.Figures[id] = Vec{X: nx, Y: ny, Z: nz}
	}
	id := payload.TurnID
	fell := hazard || py < hazardY
	cell := cellAt(px, pz, payload.Present)
	if fell || cell < 0 {
		payload.Figures[id] = Vec{X: px, Y: py, Z: pz}
		payload.Velocity = Vec{}
		payload.Note = "fell"
		eliminate(&payload, id)
	} else {
		spot := cellCenter(cell)
		payload.Cells[id] = cell
		payload.Figures[id] = spot
		payload.Lie = spot
		payload.Velocity = Vec{}
		payload.Note = "landed"
		if !contains(payload.Moved, id) {
			payload.Moved = append(payload.Moved, id)
		}
	}
	for _, other := range fallen {
		if other == id || !contains(payload.Living, other) {
			continue
		}
		eliminate(&payload, other)
	}
	if done := finishIfWon(&payload, players); done != nil {
		return *done, nil
	}
	return afterMove(payload, players)
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

func afterMove(payload Payload, players []protocol.RoomPlayer) (gamekit.Result, error) {
	if done := finishIfWon(&payload, players); done != nil {
		return *done, nil
	}
	if !allLivingMoved(payload) {
		payload.TurnID = nextUnmoved(payload)
		payload.Status = statusAim
		if payload.TurnID != "" {
			payload.Lie = payload.Figures[payload.TurnID]
		}
		payload.Velocity = Vec{}
		return gamekit.Result{Payload: payload, Scores: scoreTable(payload, players)}, nil
	}
	if presentCount(payload) <= 1 {
		payload.Status = statusAim
		payload.Moved = []string{}
		payload.Marked = []int{}
		payload.TurnID = nextLiving(payload, payload.TurnID)
		if payload.TurnID != "" {
			payload.Lie = payload.Figures[payload.TurnID]
		}
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
		cell, ok := payload.Cells[id]
		if !ok || cell < 0 || cell >= platformCount || !payload.Present[cell] {
			fallen = append(fallen, id)
		}
	}
	for _, id := range fallen {
		pos := payload.Figures[id]
		pos.Y = -1.2
		payload.Figures[id] = pos
		eliminate(payload, id)
	}
	payload.Marked = []int{}
}

func beginNextRound(payload *Payload) {
	payload.Round++
	payload.Moved = []string{}
	payload.Status = statusAim
	payload.Note = ""
	if payload.TurnID == "" || !contains(payload.Living, payload.TurnID) {
		payload.TurnID = firstLiving(*payload)
	} else {
		payload.TurnID = nextLiving(*payload, payload.TurnID)
	}
	if payload.TurnID != "" {
		payload.Lie = payload.Figures[payload.TurnID]
	}
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
		payload.Status = statusAim
		payload.Marked = []int{}
		return &gamekit.Result{
			Phase:   gamekit.Ptr("results"),
			Payload: *payload,
			Scores:  scoreTable(*payload, players),
		}
	}
	return nil
}

func pickMarked(payload Payload) []int {
	count := vanishCount(presentCount(payload))
	if count <= 0 {
		return []int{}
	}
	present := presentCells(payload)
	livingCells := map[int]int{}
	for _, id := range payload.Living {
		livingCells[payload.Cells[id]]++
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

func cellCenter(index int) Vec {
	col := index % gridSize
	row := index / gridSize
	return Vec{
		X: float64(col-1) * spacing,
		Y: restY,
		Z: float64(row-1) * spacing,
	}
}

func cellAt(x, z float64, present []bool) int {
	best := -1
	bestDist := landRadius
	for i := 0; i < platformCount; i++ {
		if i >= len(present) || !present[i] {
			continue
		}
		c := cellCenter(i)
		d := math.Hypot(x-c.X, z-c.Z)
		if d < bestDist {
			bestDist = d
			best = i
		}
	}
	return best
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
	if payload.Cells == nil {
		payload.Cells = map[string]int{}
	}
	if payload.Figures == nil {
		payload.Figures = map[string]Vec{}
	}
	if payload.Moved == nil {
		payload.Moved = []string{}
	}
	if payload.Marked == nil {
		payload.Marked = []int{}
	}
	payload.Present = normalizePresent(payload.Present)
	if payload.Status == "" {
		payload.Status = statusAim
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
	if math.IsNaN(value) || math.IsInf(value, 0) || math.Abs(value) > 40 {
		return 0, text.Error(BadFigurePos)
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

func contains(ids []string, value string) bool {
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
