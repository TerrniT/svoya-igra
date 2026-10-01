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
	result, err := d.Reduce(json.RawMessage(raw), gamekit.Context{
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

func TestStartPlacesDistinctFigures(t *testing.T) {
	d := Driver{}
	result := reduce(t, d, emptyPayload(), "lobby", "a", true, `{"type":"start"}`)
	if result.Phase == nil || *result.Phase != "play" {
		t.Fatalf("phase %v", result.Phase)
	}
	state := asState(t, result.Payload)
	if state.Cells["a"] == state.Cells["b"] {
		t.Fatalf("shared start: %+v", state.Cells)
	}
	if state.TurnID != "a" || state.Status != statusAim {
		t.Fatalf("turn/status %+v", state)
	}
	if _, ok := state.Figures["a"]; !ok {
		t.Fatal("missing figure")
	}
}

func TestPushSettleThenVanish(t *testing.T) {
	d := Driver{}
	state := asState(t, reduce(t, d, emptyPayload(), "lobby", "a", true, `{"type":"start"}`).Payload)

	afterPush := reduce(t, d, state, "play", "a", true, `{"type":"push","yaw":0.2,"power":0.4}`)
	state = asState(t, afterPush.Payload)
	if state.Status != statusRoll || state.Shot != 1 {
		t.Fatalf("after push %+v", state)
	}

	spot := cellCenter(1)
	settleRaw, _ := json.Marshal(map[string]any{
		"type": "settle", "shot": 1, "x": spot.X, "y": spot.Y, "z": spot.Z, "hazard": false,
	})
	afterA := reduce(t, d, state, "play", "a", true, string(settleRaw))
	state = asState(t, afterA.Payload)
	if state.Cells["a"] != 1 || state.TurnID != "b" || state.Status != statusAim {
		t.Fatalf("after settle a %+v", state)
	}

	afterBPush := reduce(t, d, state, "play", "b", false, `{"type":"push","yaw":1.2,"power":0.4}`)
	state = asState(t, afterBPush.Payload)
	spotB := cellCenter(7)
	settleB, _ := json.Marshal(map[string]any{
		"type": "settle", "shot": state.Shot, "x": spotB.X, "y": spotB.Y, "z": spotB.Z, "hazard": false,
	})
	afterB := reduce(t, d, state, "play", "a", true, string(settleB))
	state = asState(t, afterB.Payload)
	if state.Status != statusWarning {
		t.Fatalf("status %s", state.Status)
	}
	if len(state.Marked) != 2 {
		t.Fatalf("expected 2 marked, got %v", state.Marked)
	}

	vanished := reduce(t, d, state, "play", "a", true, `{"type":"vanish"}`)
	state = asState(t, vanished.Payload)
	if state.Status != statusAim {
		t.Fatalf("after vanish status %s", state.Status)
	}
	if presentCount(state) != 7 {
		t.Fatalf("present %d", presentCount(state))
	}
}

func TestHazardEliminatesAndCanWin(t *testing.T) {
	d := Driver{}
	state := asState(t, reduce(t, d, emptyPayload(), "lobby", "a", true, `{"type":"start"}`).Payload)
	state = asState(t, reduce(t, d, state, "play", "a", true, `{"type":"push","yaw":0,"power":0.8}`).Payload)
	after := reduce(t, d, state, "play", "a", true, `{"type":"settle","shot":1,"x":0,"y":-1,"z":0,"hazard":true}`)
	if after.Phase == nil || *after.Phase != "results" {
		t.Fatalf("phase %v", after.Phase)
	}
	final := asState(t, after.Payload)
	if final.WinnerID != "b" {
		t.Fatalf("winner %s", final.WinnerID)
	}
}

func TestNeverMarksLastPlatform(t *testing.T) {
	state := openRound(players("a", "b"))
	state.Present = make([]bool, 9)
	state.Present[4] = true
	state.Cells["a"] = 4
	state.Cells["b"] = 4
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
	state.Cells["a"] = 0
	state.Cells["b"] = 8
	marked := pickMarked(state)
	if len(marked) != 1 || marked[0] != 4 {
		t.Fatalf("expected empty center, got %v", marked)
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
