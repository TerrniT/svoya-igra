package main

import (
	"log"
	"net/http"

	"svoya-igra/internal/config"
	"svoya-igra/internal/games"
	"svoya-igra/internal/room"
)

func main() {
	cfg := config.Load()
	hub := room.NewHub(games.NewCatalog(), cfg)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("GET /api/join-info", hub.HandleJoinInfo)
	mux.HandleFunc(cfg.WSPath, hub.HandleWS)

	log.Printf("rooms listening on %s", cfg.Addr())
	if err := http.ListenAndServe(cfg.Addr(), mux); err != nil {
		log.Fatal(err)
	}
}
