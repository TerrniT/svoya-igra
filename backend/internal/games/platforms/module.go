package platforms

import (
	"encoding/json"

	"svoya-igra/internal/gamekit"
)

const (
	MinPlayers = 2
	MaxPlayers = 9
)

type Settings struct {
	MaxPlayers int `json:"maxPlayers,omitempty"`
}

type Module struct{}

func NewModule() Module { return Module{} }

func (Module) ID() string { return "platforms" }

func (Module) Driver() gamekit.Driver { return Driver{} }

func (Module) DefaultSettings() json.RawMessage {
	return gamekit.EncodeSettings(Settings{MaxPlayers: MaxPlayers})
}

func (Module) NormalizeSettings(raw json.RawMessage) (json.RawMessage, error) {
	settings, err := gamekit.DecodeSettings[Settings](raw)
	if err != nil {
		return nil, err
	}
	if settings.MaxPlayers <= 0 || settings.MaxPlayers > MaxPlayers {
		settings.MaxPlayers = MaxPlayers
	}
	return gamekit.EncodeSettings(settings), nil
}
