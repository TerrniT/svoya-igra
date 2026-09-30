package gamekit

import (
	"encoding/json"

	"svoya-igra/internal/protocol"
)

type Result struct {
	Phase     *string
	Payload   any
	Scores    map[string]int
	StartedAt **string
	Notices   []protocol.Notice
	Volatile  bool
}

type Context struct {
	Players        []protocol.RoomPlayer
	HostPlayerID   string
	Scores         map[string]int
	Phase          string
	Payload        any
	Settings       json.RawMessage
	ClientPlayerID string
	ClientRole     protocol.Role
	IsHost         bool
}

type Viewer struct {
	PlayerID string
	IsHost   bool
}

type Driver interface {
	CreatePayload(settings json.RawMessage) (any, error)
	InitialPhase() string
	CanStart(players []protocol.RoomPlayer, payload any, settings json.RawMessage) error
	Reduce(raw json.RawMessage, ctx Context) (Result, error)
	ToClientPayload(payload any, phase string, viewer Viewer) (any, error)
	OnPlayerRemoved(payload any, playerID string) (any, error)
	AfterDisconnect(payload any, players []protocol.RoomPlayer, scores map[string]int) *Result
}

type Module interface {
	ID() string
	Driver() Driver
	DefaultSettings() json.RawMessage
	NormalizeSettings(raw json.RawMessage) (json.RawMessage, error)
}

func Ptr[T any](value T) *T {
	return &value
}

func SetStartedAt(value *string) **string {
	return &value
}

func DecodeJSON[T any](value any) (T, error) {
	var out T
	raw, err := json.Marshal(value)
	if err != nil {
		return out, err
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return out, err
	}
	return out, nil
}

func DecodeSettings[T any](raw json.RawMessage) (T, error) {
	var out T
	if len(raw) == 0 || string(raw) == "null" {
		return out, nil
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return out, err
	}
	return out, nil
}

func EncodeSettings(value any) json.RawMessage {
	raw, err := json.Marshal(value)
	if err != nil {
		return json.RawMessage(`{}`)
	}
	return raw
}
