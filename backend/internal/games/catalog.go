package games

import (
	"svoya-igra/internal/gamekit"
	"svoya-igra/internal/games/deepquestion"
	"svoya-igra/internal/games/golf"
	"svoya-igra/internal/games/quiz"
	"svoya-igra/internal/games/whoami"
)

func NewCatalog() *gamekit.Registry {
	registry := gamekit.NewRegistry()
	registry.MustRegister(
		quiz.NewModule(),
		whoami.NewModule(),
		golf.NewModule(),
		deepquestion.NewModule(),
	)
	return registry
}
