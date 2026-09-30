package whoami

import (
	"encoding/json"

	"svoya-igra/internal/gamekit"
)

type Settings struct {
	MaxPlayers int `json:"maxPlayers,omitempty"`
}

type Module struct{}

func NewModule() Module { return Module{} }

func (Module) ID() string { return "whoami" }

func (Module) Driver() gamekit.Driver { return Driver{} }

func (Module) DefaultSettings() json.RawMessage {
	return gamekit.EncodeSettings(Settings{})
}

func (Module) NormalizeSettings(raw json.RawMessage) (json.RawMessage, error) {
	settings, err := gamekit.DecodeSettings[Settings](raw)
	if err != nil {
		return nil, err
	}
	return gamekit.EncodeSettings(settings), nil
}
