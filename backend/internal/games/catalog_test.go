package games_test

import (
	"testing"

	"svoya-igra/internal/games"
)

func TestCatalogResolvesKnownGames(t *testing.T) {
	catalog := games.NewCatalog()
	for _, id := range []string{"quiz", "whoami", "golf", "deep-question", "platforms"} {
		mod, err := catalog.Resolve(id)
		if err != nil {
			t.Fatalf("%s: %v", id, err)
		}
		if mod.ID() != id {
			t.Fatalf("id %q != %q", mod.ID(), id)
		}
		if _, err := mod.NormalizeSettings(nil); err != nil {
			t.Fatalf("%s settings: %v", id, err)
		}
	}
}

func TestCatalogUnknownGame(t *testing.T) {
	_, err := games.NewCatalog().Resolve("nope")
	if err == nil {
		t.Fatal("expected error")
	}
	if err.Error() != "Неизвестная игра: nope" {
		t.Fatalf("unexpected: %v", err)
	}
}
