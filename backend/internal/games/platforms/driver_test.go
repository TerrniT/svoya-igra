package platforms

import (
	"encoding/json"
	"testing"

	"svoya-igra/internal/gamekit"
	"svoya-igra/internal/protocol"
)

func players(ids ...string) []protocol.RoomPlayer {
	out := make([]protocol.RoomPlayer, 0, len(ids))
	for _, id := range ids {
		out = append(out, protocol.RoomPlayer{ID: id, Name: id})
	}
	return out
}

func reduce(t *testing.T, d Driver, payload any, phase, client string, host bool, raw string) gamekit.Result {
	t.Helper()
	msg := json.RawMessage(raw)
	result, err := d.Reduce(msg, gamekit.Context{
		Players:        players("a", "b"),
		HostPlayerID:   "a",
		Scores:         map[string]int{},
		Phase:          phase,
		Payload:        payload,
		ClientPlayerID: client,
		ClientRole:     protocol.RoleHost,
		IsHost:         host,
	})
	if err != nil {
		t.Fatalf("reduce %s: %v", raw, err)
	}
	return result
}

func asState(t *testing.T, value any) Payload {
	t.Helper()
	payload, err := asPayload(value)
	if err != nil {
		t.Fatal(err)
	}
	return payload
}

func TestCanStartLimits(t *testing.T) {
	d := Driver{}
	if err := d.CanStart(players("a"), nil, nil); err == nil {
		t.Fatal("expected min players error")
	}
	tooMany := players("1", "2", "3", "4", "5", "6", "7", "8", "9", "10")
	if err := d.CanStart(tooMany, nil, nil); err == nil {
		t.Fatal("expected max players error")
	}
	if err := d.CanStart(players("a", "b"), nil, nil); err != nil {
		t.Fatal(err)
	}
}

func TestStartPlacesDistinctPlatforms(t *testing.T) {
	d := Driver{}
	result := reduce(t, d, emptyPayload(), "lobby", "a", true, `{"type":"start"}`)
	if result.Phase == nil || *result.Phase != "play" {
		t.Fatalf("phase %v", result.Phase)
	}
	state := asState(t, result.Payload)
	if state.Positions["a"] == state.Positions["b"] {
		t.Fatalf("shared start: %+v", state.Positions)
	}
	if state.TurnID != "a" || state.Status != statusMove {
		t.Fatalf("turn/status %+v", state)
	}
}

func TestPushAdjacentThenVanish(t *testing.T) {
	d := Driver{}
	started := reduce(t, d, emptyPayload(), "lobby", "a", true, `{"type":"start"}`)
	state := asState(t, started.Payload)
	fromA := state.Positions["a"]
	targets := legalPushTargets(state, "a")
	if len(targets) == 0 {
		t.Fatal("no legal pushes")
	}
	toA := targets[0]
	if !adjacent(fromA, toA) {
		t.Fatal("helper picked non-adjacent")
	}

	raw, _ := json.Marshal(map[string]any{"type": "push", "to": toA})
	afterA := reduce(t, d, state, "play", "a", true, string(raw))
	state = asState(t, afterA.Payload)
	if state.Positions["a"] != toA {
		t.Fatalf("a stayed at %d", state.Positions["a"])
	}
	if state.TurnID != "b" {
		t.Fatalf("expected b, got %s", state.TurnID)
	}

	targetsB := legalPushTargets(state, "b")
	raw, _ = json.Marshal(map[string]any{"type": "push", "to": targetsB[0]})
	afterB := reduce(t, d, state, "play", "b", false, string(raw))
	state = asState(t, afterB.Payload)
	if state.Status != statusWarning {
		t.Fatalf("status %s", state.Status)
	}
	if len(state.Marked) != 2 {
		t.Fatalf("expected 2 marked on a full board, got %v", state.Marked)
	}
	for _, cell := range state.Marked {
		if !state.Present[cell] {
			t.Fatalf("marked missing cell %d", cell)
		}
	}

	vanished := reduce(t, d, state, "play", "a", true, `{"type":"vanish"}`)
	state = asState(t, vanished.Payload)
	if state.Status != statusMove {
		t.Fatalf("after vanish status %s", state.Status)
	}
	if presentCount(state) != 7 {
		t.Fatalf("present %d", presentCount(state))
	}
}

func TestRejectsNonAdjacentPush(t *testing.T) {
	d := Driver{}
	state := openRound(players("a", "b"))
	// a starts on 0, opposite corner 8 is not adjacent
	_, err := d.Reduce(json.RawMessage(`{"type":"push","to":8}`), gamekit.Context{
		Players:        players("a", "b"),
		HostPlayerID:   "a",
		Phase:          "play",
		Payload:        state,
		ClientPlayerID: "a",
		IsHost:         true,
	})
	if err == nil {
		t.Fatal("expected non-adjacent error")
	}
}

func TestNeverMarksLastPlatform(t *testing.T) {
	state := openRound(players("a", "b"))
	state.Present = make([]bool, 9)
	state.Present[4] = true
	state.Positions["a"] = 4
	state.Positions["b"] = 4
	if got := pickMarked(state); len(got) != 0 {
		t.Fatalf("marked last island: %v", got)
	}
	if vanishCount(1) != 0 {
		t.Fatal("vanishCount(1) must be 0")
	}
}

func TestPreferEmptyWhenVanishing(t *testing.T) {
	state := openRound(players("a", "b"))
	state.Seed = 1
	state.Round = 3
	state.Present = []bool{true, false, false, false, true, false, false, false, true}
	state.Positions["a"] = 0
	state.Positions["b"] = 8
	marked := pickMarked(state)
	if len(marked) != 1 || marked[0] != 4 {
		t.Fatalf("expected empty center, got %v", marked)
	}
}

func TestShoveOnLastIslandWins(t *testing.T) {
	d := Driver{}
	state := openRound(players("a", "b"))
	state.Present = make([]bool, 9)
	state.Present[4] = true
	state.Positions["a"] = 4
	state.Positions["b"] = 4
	state.Status = statusShove
	state.TurnID = "a"
	result := reduce(t, d, state, "play", "a", true, `{"type":"shove","playerId":"b"}`)
	if result.Phase == nil || *result.Phase != "results" {
		t.Fatalf("phase %v", result.Phase)
	}
	final := asState(t, result.Payload)
	if final.WinnerID != "a" {
		t.Fatalf("winner %s", final.WinnerID)
	}
	if result.Scores["a"] != 1 || result.Scores["b"] != 0 {
		t.Fatalf("scores %+v", result.Scores)
	}
}

func TestSkipTurnCountsAsMove(t *testing.T) {
	d := Driver{}
	state := openRound(players("a", "b"))
	result := reduce(t, d, state, "play", "a", true, `{"type":"skipTurn"}`)
	next := asState(t, result.Payload)
	if next.TurnID != "b" {
		t.Fatalf("turn %s", next.TurnID)
	}
	if !contains(next.Moved, "a") {
		t.Fatal("skip did not mark moved")
	}
}

func TestAdjacentIncludesDiagonals(t *testing.T) {
	if !adjacent(0, 4) || !adjacent(4, 8) || adjacent(0, 8) || adjacent(0, 0) {
		t.Fatal("adjacency grid is wrong")
	}
}
