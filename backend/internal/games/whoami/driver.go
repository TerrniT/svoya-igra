package whoami

import (
	"encoding/json"
	"math/rand/v2"

	"svoya-igra/internal/gamekit"
	"svoya-igra/internal/protocol"
	"svoya-igra/internal/text"
)

type CardState struct {
	ID      string `json:"id"`
	Text    string `json:"text"`
	Guessed bool   `json:"guessed"`
}

type Payload struct {
	Cards map[string]CardState `json:"cards"`
}

type Driver struct{}

func (Driver) CreatePayload(_ json.RawMessage) (any, error) {
	return Payload{Cards: map[string]CardState{}}, nil
}

func (Driver) InitialPhase() string { return "lobby" }

func (Driver) CanStart(players []protocol.RoomPlayer, _ any, settings json.RawMessage) error {
	if len(players) < 2 {
		return text.Error(text.NeedTwoPlayers)
	}
	limit := playerLimit(settings)
	if len(players) > limit {
		return text.Errorf(TooManyPlayers, limit)
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
		scores := map[string]int{}
		for _, player := range ctx.Players {
			scores[player.ID] = 0
		}
		dealt, err := dealCards(ctx.Players)
		if err != nil {
			return gamekit.Result{}, err
		}
		return gamekit.Result{
			Phase:     gamekit.Ptr("play"),
			Payload:   dealt,
			Scores:    scores,
			StartedAt: gamekit.SetStartedAt(gamekit.Ptr(currentTime())),
		}, nil
	}

	if msg.Type == "markGuessed" {
		if !ctx.IsHost {
			return gamekit.Result{}, text.Error(HostMarksGuess)
		}
		if ctx.Phase != "play" {
			return gamekit.Result{}, text.Error(text.GameNotStarted)
		}
		card, ok := payload.Cards[msg.PlayerID]
		if !ok {
			return gamekit.Result{}, text.Error(NoCard)
		}
		if card.Guessed {
			return gamekit.Result{}, text.Error(AlreadyGuessed)
		}
		card.Guessed = true
		payload.Cards[msg.PlayerID] = card
		var name *string
		for _, player := range ctx.Players {
			if player.ID == msg.PlayerID {
				n := player.Name
				name = &n
				break
			}
		}
		notices := []protocol.Notice{{Kind: "guessed", PlayerName: name}}
		if allGuessed(payload) {
			return gamekit.Result{Phase: gamekit.Ptr("results"), Payload: payload, Notices: notices}, nil
		}
		return gamekit.Result{Payload: payload, Notices: notices}, nil
	}

	return gamekit.Result{}, text.Error(UnknownMessage)
}

func (Driver) ToClientPayload(payload any, _ string, viewer gamekit.Viewer) (any, error) {
	state, err := asPayload(payload)
	if err != nil {
		return nil, err
	}
	cards := map[string]CardState{}
	for playerID, card := range state.Cards {
		if playerID == viewer.PlayerID && !card.Guessed {
			cards[playerID] = CardState{ID: card.ID, Text: "???", Guessed: false}
			continue
		}
		cards[playerID] = card
	}
	return Payload{Cards: cards}, nil
}

func (Driver) OnPlayerRemoved(payload any, playerID string) (any, error) {
	state, err := asPayload(payload)
	if err != nil {
		return payload, err
	}
	delete(state.Cards, playerID)
	return state, nil
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
	if payload.Cards == nil {
		payload.Cards = map[string]CardState{}
	}
	return payload, nil
}

func dealCards(players []protocol.RoomPlayer) (Payload, error) {
	if len(players) > len(Deck) {
		return Payload{}, text.Errorf(DeckTooSmall, len(Deck), len(players))
	}
	shuffled := append([]CardDef{}, Deck...)
	rand.Shuffle(len(shuffled), func(i, j int) { shuffled[i], shuffled[j] = shuffled[j], shuffled[i] })
	cards := map[string]CardState{}
	for i, player := range players {
		card := shuffled[i]
		cards[player.ID] = CardState{ID: card.ID, Text: card.Text, Guessed: false}
	}
	return Payload{Cards: cards}, nil
}

func allGuessed(payload Payload) bool {
	if len(payload.Cards) == 0 {
		return false
	}
	for _, card := range payload.Cards {
		if !card.Guessed {
			return false
		}
	}
	return true
}

func playerLimit(settings json.RawMessage) int {
	parsed, err := gamekit.DecodeSettings[Settings](settings)
	if err != nil || parsed.MaxPlayers <= 0 || parsed.MaxPlayers > len(Deck) {
		return len(Deck)
	}
	return parsed.MaxPlayers
}
