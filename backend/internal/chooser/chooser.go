package chooser

import (
	"svoya-igra/internal/protocol"
	"svoya-igra/internal/text"
)

func Playing(players []protocol.RoomPlayer) []protocol.RoomPlayer {
	out := make([]protocol.RoomPlayer, 0, len(players))
	for _, player := range players {
		if !player.IsHost {
			out = append(out, player)
		}
	}
	return out
}

func NextChooserID(players []protocol.RoomPlayer, current string) string {
	if len(players) == 0 {
		return ""
	}
	currentIndex := -1
	for i, player := range players {
		if player.ID == current {
			currentIndex = i
			break
		}
	}
	if currentIndex == -1 {
		return players[0].ID
	}
	return players[(currentIndex+1)%len(players)].ID
}

func RequireChooser(players []protocol.RoomPlayer, playerID string) (string, error) {
	for _, player := range players {
		if player.ID == playerID {
			return playerID, nil
		}
	}
	return "", text.Error(text.PlayerNotInRoom)
}
