package quiz

import (
	"encoding/json"

	"svoya-igra/internal/gamekit"
	"svoya-igra/internal/text"
)

type Settings struct {
	Bank Bank `json:"bank"`
}

type Module struct{}

func NewModule() Module { return Module{} }

func (Module) ID() string { return "quiz" }

func (Module) Driver() gamekit.Driver { return Driver{} }

func (Module) DefaultSettings() json.RawMessage {
	return gamekit.EncodeSettings(Settings{Bank: Bank{Categories: []Category{}, Questions: []Question{}}})
}

func (m Module) NormalizeSettings(raw json.RawMessage) (json.RawMessage, error) {
	settings, err := gamekit.DecodeSettings[Settings](raw)
	if err != nil {
		return nil, text.Error(BadBank)
	}
	if settings.Bank.Categories == nil {
		settings.Bank.Categories = []Category{}
	}
	if settings.Bank.Questions == nil {
		settings.Bank.Questions = []Question{}
	}
	return gamekit.EncodeSettings(settings), nil
}
