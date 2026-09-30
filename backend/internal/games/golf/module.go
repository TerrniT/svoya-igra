package golf

import (
	"encoding/json"

	"svoya-igra/internal/gamekit"
)

type Settings struct {
	MaxStrokes int `json:"maxStrokes,omitempty"`
	MaxPlayers int `json:"maxPlayers,omitempty"`
}

type Module struct{}

func NewModule() Module { return Module{} }

func (Module) ID() string { return "golf" }

func (Module) Driver() gamekit.Driver { return Driver{} }

func (Module) DefaultSettings() json.RawMessage {
	return gamekit.EncodeSettings(Settings{MaxStrokes: maxStrokes, MaxPlayers: 8})
}

func (m Module) NormalizeSettings(raw json.RawMessage) (json.RawMessage, error) {
	settings, err := gamekit.DecodeSettings[Settings](raw)
	if err != nil {
		return nil, err
	}
	if settings.MaxStrokes <= 0 {
		settings.MaxStrokes = maxStrokes
	}
	if settings.MaxPlayers <= 0 {
		settings.MaxPlayers = 8
	}
	return gamekit.EncodeSettings(settings), nil
}
