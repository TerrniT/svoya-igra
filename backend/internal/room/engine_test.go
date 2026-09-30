package room_test

import (
	"encoding/json"
	"testing"

	"svoya-igra/internal/games"
	"svoya-igra/internal/protocol"
	"svoya-igra/internal/room"
)

type memClient struct {
	key  string
	msgs []protocol.ServerMessage
}

func (m *memClient) Key() string { return m.key }
func (m *memClient) Send(message protocol.ServerMessage) {
	m.msgs = append(m.msgs, message)
}
func (m *memClient) Close() {}

func lastHello(t *testing.T, client *memClient) protocol.ServerMessage {
	t.Helper()
	for i := len(client.msgs) - 1; i >= 0; i-- {
		if client.msgs[i].Type == "hello" {
			return client.msgs[i]
		}
	}
	t.Fatal("no hello")
	return protocol.ServerMessage{}
}

func lastState(t *testing.T, client *memClient) protocol.RoomSnapshot {
	t.Helper()
	for i := len(client.msgs) - 1; i >= 0; i-- {
		if client.msgs[i].Type == "state" && client.msgs[i].Snapshot != nil {
			return *client.msgs[i].Snapshot
		}
	}
	if hello := lastHello(t, client); hello.Snapshot != nil {
		return *hello.Snapshot
	}
	t.Fatal("no state")
	return protocol.RoomSnapshot{}
}

func TestWhoamiMasksOwnCard(t *testing.T) {
	mod, err := games.NewCatalog().Resolve("whoami")
	if err != nil {
		t.Fatal(err)
	}
	settings, err := mod.NormalizeSettings(nil)
	if err != nil {
		t.Fatal(err)
	}
	engine := room.NewEngine(mod.Driver())
	host := &memClient{key: "host"}
	guest := &memClient{key: "guest"}
	if err := engine.Create("1234", "Лео", "device-host", "whoami", "studio", settings, host); err != nil {
		t.Fatal(err)
	}
	join, _ := json.Marshal(map[string]any{"type": "join", "name": "Мара", "deviceId": "device-guest", "code": "1234"})
	if err := engine.Handle(guest, join); err != nil {
		t.Fatal(err)
	}
	start, _ := json.Marshal(map[string]any{"type": "start"})
	if err := engine.Handle(host, start); err != nil {
		t.Fatal(err)
	}

	hostSnap := lastState(t, host)
	guestSnap := lastState(t, guest)
	hostID := lastHello(t, host).PlayerID
	guestID := lastHello(t, guest).PlayerID

	hostPayload, _ := json.Marshal(hostSnap.Payload)
	guestPayload, _ := json.Marshal(guestSnap.Payload)
	var hostCards struct {
		Cards map[string]struct {
			Text string `json:"text"`
		} `json:"cards"`
	}
	var guestCards struct {
		Cards map[string]struct {
			Text string `json:"text"`
		} `json:"cards"`
	}
	if err := json.Unmarshal(hostPayload, &hostCards); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(guestPayload, &guestCards); err != nil {
		t.Fatal(err)
	}
	if hostCards.Cards[hostID].Text != "???" {
		t.Fatalf("host should not see own card, got %q", hostCards.Cards[hostID].Text)
	}
	if guestCards.Cards[guestID].Text != "???" {
		t.Fatalf("guest should not see own card, got %q", guestCards.Cards[guestID].Text)
	}
	if hostCards.Cards[guestID].Text == "???" {
		t.Fatal("host should see guest card")
	}
	if guestCards.Cards[hostID].Text == "???" {
		t.Fatal("guest should see host card")
	}
}

func TestQuizHidesAnswersUntilReveal(t *testing.T) {
	mod, err := games.NewCatalog().Resolve("quiz")
	if err != nil {
		t.Fatal(err)
	}
	bank := map[string]any{
		"categories": []any{map[string]any{"id": "cat", "name": "Проверка", "order": 0}},
		"questions": []any{
			map[string]any{
				"id": "q-1", "categoryId": "cat", "value": 100, "text": "Столица?", "kind": "single",
				"answers": []any{
					map[string]any{"id": "a-1", "text": "Париж", "isCorrect": true},
					map[string]any{"id": "a-2", "text": "Лион", "isCorrect": false},
				},
			},
		},
	}
	rawSettings, _ := json.Marshal(map[string]any{"bank": bank})
	settings, err := mod.NormalizeSettings(rawSettings)
	if err != nil {
		t.Fatal(err)
	}
	engine := room.NewEngine(mod.Driver())
	host := &memClient{key: "host"}
	guest := &memClient{key: "guest"}
	if err := engine.Create("1234", "Ведущий", "device-host", "quiz", "studio", settings, host); err != nil {
		t.Fatal(err)
	}
	join, _ := json.Marshal(map[string]any{"type": "join", "name": "Игрок", "deviceId": "device-guest", "code": "1234"})
	if err := engine.Handle(guest, join); err != nil {
		t.Fatal(err)
	}
	guestID := lastHello(t, guest).PlayerID
	start, _ := json.Marshal(map[string]any{"type": "start", "firstChooserId": guestID})
	if err := engine.Handle(host, start); err != nil {
		t.Fatal(err)
	}
	open, _ := json.Marshal(map[string]any{"type": "openQuestion", "questionId": "q-1"})
	if err := engine.Handle(guest, open); err != nil {
		t.Fatal(err)
	}
	snap := lastState(t, guest)
	raw, _ := json.Marshal(snap.Payload)
	var payload struct {
		Answers []struct {
			Text      string `json:"text"`
			IsCorrect bool   `json:"isCorrect"`
		} `json:"answers"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Answers) != 2 {
		t.Fatalf("expected 2 answers, got %d", len(payload.Answers))
	}
	for _, answer := range payload.Answers {
		if answer.IsCorrect {
			t.Fatalf("correct flag leaked before reveal: %+v", answer)
		}
	}
}
