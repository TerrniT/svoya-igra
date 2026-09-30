package deepquestion

import (
	"encoding/json"

	"svoya-igra/internal/gamekit"
	"svoya-igra/internal/text"
)

type Settings struct {
	Questions []Question `json:"questions"`
	Category  string     `json:"category,omitempty"`
}

type Module struct{}

func NewModule() Module { return Module{} }

func (Module) ID() string { return "deep-question" }

func (Module) Driver() gamekit.Driver { return Driver{} }

func (Module) DefaultSettings() json.RawMessage {
	return gamekit.EncodeSettings(Settings{Questions: []Question{}})
}

func (Module) NormalizeSettings(raw json.RawMessage) (json.RawMessage, error) {
	settings, err := gamekit.DecodeSettings[Settings](raw)
	if err != nil {
		return nil, text.Error(BadCollection)
	}
	if settings.Category != "" {
		filtered := make([]Question, 0, len(settings.Questions))
		for _, question := range settings.Questions {
			if question.Category == settings.Category {
				filtered = append(filtered, question)
			}
		}
		settings.Questions = filtered
	}
	if settings.Questions == nil {
		settings.Questions = []Question{}
	}
	return gamekit.EncodeSettings(settings), nil
}
