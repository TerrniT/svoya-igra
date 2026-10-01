package protocol

type Role string

const (
	RoleHost   Role = "host"
	RolePlayer Role = "player"
)

type RoomPlayer struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	DeviceID  string `json:"deviceId"`
	Connected bool   `json:"connected"`
	IsHost    bool   `json:"isHost"`
}

type RoomSession struct {
	Players   []RoomPlayer   `json:"players"`
	Scores    map[string]int `json:"scores"`
	StartedAt *string        `json:"startedAt"`
}

type RoomSnapshot struct {
	Code    string      `json:"code"`
	GameID  string      `json:"gameId"`
	ThemeID string      `json:"themeId"`
	Phase   string      `json:"phase"`
	Paused  bool        `json:"paused"`
	Session RoomSession `json:"session"`
	Payload any         `json:"payload"`
}

type Notice struct {
	Kind       string  `json:"kind"`
	PlayerName *string `json:"playerName,omitempty"`
	Value      *int    `json:"value,omitempty"`
}

type ServerMessage struct {
	Type       string        `json:"type"`
	PlayerID   string        `json:"playerId,omitempty"`
	Role       Role          `json:"role,omitempty"`
	Snapshot   *RoomSnapshot `json:"snapshot,omitempty"`
	Kind       string        `json:"kind,omitempty"`
	PlayerName *string       `json:"playerName,omitempty"`
	Value      *int          `json:"value,omitempty"`
	Message    string        `json:"message,omitempty"`
}

func EmptySession() RoomSession {
	return RoomSession{
		Players:   []RoomPlayer{},
		Scores:    map[string]int{},
		StartedAt: nil,
	}
}

func ErrorMessage(message string) ServerMessage {
	return ServerMessage{Type: "error", Message: message}
}

func HelloMessage(playerID string, role Role, snapshot RoomSnapshot) ServerMessage {
	return ServerMessage{
		Type:     "hello",
		PlayerID: playerID,
		Role:     role,
		Snapshot: &snapshot,
	}
}

func StateMessage(snapshot RoomSnapshot) ServerMessage {
	return ServerMessage{Type: "state", Snapshot: &snapshot}
}

func NoticeMessage(notice Notice) ServerMessage {
	return ServerMessage{
		Type:       "notice",
		Kind:       notice.Kind,
		PlayerName: notice.PlayerName,
		Value:      notice.Value,
	}
}
