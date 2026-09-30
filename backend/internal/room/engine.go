package room

import (
	"encoding/json"

	"svoya-igra/internal/clonejson"
	"svoya-igra/internal/ids"
	"svoya-igra/internal/protocol"
	"svoya-igra/internal/text"
)

type WireClient interface {
	Key() string
	Send(message protocol.ServerMessage)
	Close()
}

type client struct {
	WireClient
	deviceID string
	playerID string
	role     protocol.Role
}

type RoomState struct {
	Code         string
	GameID       string
	ThemeID      string
	HostPlayerID string
	Session      protocol.RoomSession
	Phase        string
	Payload      any
	Settings     json.RawMessage
}

type Engine struct {
	room   *liveRoom
	driver Driver
}

type liveRoom struct {
	RoomState
	clients map[string]*client
	driver  Driver
}

func NewEngine(driver Driver) *Engine {
	return &Engine{driver: driver}
}

func (e *Engine) Create(code, name, deviceID, gameID, themeID string, settings json.RawMessage, host WireClient) error {
	if name == "" {
		return text.Error(text.HostNameRequired)
	}
	payload, err := e.driver.CreatePayload(settings)
	if err != nil {
		return err
	}
	live := &liveRoom{
		RoomState: RoomState{
			Code:     code,
			GameID:   gameID,
			ThemeID:  themeID,
			Session:  protocol.EmptySession(),
			Phase:    e.driver.InitialPhase(),
			Payload:  payload,
			Settings: settings,
		},
		clients: map[string]*client{},
		driver:  e.driver,
	}
	player := addPlayer(live, name, deviceID, true)
	live.HostPlayerID = player.ID
	e.room = live
	hostClient := &client{
		WireClient: host,
		deviceID:   deviceID,
		playerID:   player.ID,
		role:       protocol.RoleHost,
	}
	live.clients[host.Key()] = hostClient
	host.Send(protocol.HelloMessage(player.ID, protocol.RoleHost, e.snapshotFor(live, hostClient)))
	return nil
}

func (e *Engine) Handle(wire WireClient, raw json.RawMessage) error {
	if e.room == nil {
		return text.Error(text.RoomClosed)
	}
	var head struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(raw, &head); err != nil {
		return text.Error(text.BadMessage)
	}
	current := e.room.clients[wire.Key()]

	switch head.Type {
	case "join":
		var msg struct {
			Name     string `json:"name"`
			DeviceID string `json:"deviceId"`
		}
		if err := json.Unmarshal(raw, &msg); err != nil {
			return text.Error(text.BadMessage)
		}
		if msg.Name == "" {
			return text.Error(text.PlayerNameRequired)
		}
		if existing := findByDevice(e.room, msg.DeviceID); existing != nil {
			e.attach(wire, e.room, *existing, msg.DeviceID)
			return nil
		}
		player := addPlayer(e.room, msg.Name, msg.DeviceID, false)
		next := &client{
			WireClient: wire,
			deviceID:   msg.DeviceID,
			playerID:   player.ID,
			role:       protocol.RolePlayer,
		}
		e.room.clients[wire.Key()] = next
		wire.Send(protocol.HelloMessage(player.ID, protocol.RolePlayer, e.snapshotFor(e.room, next)))
		e.broadcastState(e.room)
		return nil
	case "reconnect":
		var msg struct {
			DeviceID string `json:"deviceId"`
		}
		if err := json.Unmarshal(raw, &msg); err != nil {
			return text.Error(text.BadMessage)
		}
		player := findByDevice(e.room, msg.DeviceID)
		if player == nil {
			return text.Error(text.ReconnectFailed)
		}
		e.attach(wire, e.room, *player, msg.DeviceID)
		return nil
	}

	if current == nil {
		return text.Error(text.JoinRoomFirst)
	}

	if head.Type == "leave" {
		delete(e.room.clients, wire.Key())
		if current.role == protocol.RoleHost {
			e.Close()
			return nil
		}
		e.removePlayer(e.room, current.playerID)
		e.broadcastState(e.room)
		wire.Close()
		return nil
	}

	if head.Type == "kick" {
		var msg struct {
			PlayerID string `json:"playerId"`
		}
		if err := json.Unmarshal(raw, &msg); err != nil {
			return text.Error(text.BadMessage)
		}
		if !e.requireHost(current) {
			return text.Error(text.KickHostOnly)
		}
		if msg.PlayerID == e.room.HostPlayerID {
			return text.Error(text.KickHostForbidden)
		}
		e.removePlayer(e.room, msg.PlayerID)
		for key, item := range e.room.clients {
			if item.playerID == msg.PlayerID {
				item.Send(protocol.ErrorMessage(text.Kicked))
				delete(e.room.clients, key)
				item.Close()
			}
		}
		e.broadcastState(e.room)
		return nil
	}

	if head.Type == "join" || head.Type == "reconnect" || head.Type == "leave" || head.Type == "kick" {
		return nil
	}

	result, err := e.room.driver.Reduce(raw, Context{
		Players:        clonejson.Clone(e.room.Session.Players),
		HostPlayerID:   e.room.HostPlayerID,
		Scores:         clonejson.Clone(e.room.Session.Scores),
		Phase:          e.room.Phase,
		Payload:        clonejson.CloneAny(e.room.Payload),
		Settings:       e.room.Settings,
		ClientPlayerID: current.playerID,
		ClientRole:     current.role,
		IsHost:         e.requireHost(current),
	})
	if err != nil {
		return err
	}
	e.applyResult(e.room, result)
	e.broadcastState(e.room)
	return nil
}

func (e *Engine) Disconnect(key string) {
	if e.room == nil {
		return
	}
	current := e.room.clients[key]
	if current == nil {
		return
	}
	delete(e.room.clients, key)
	setConnected(e.room, current.playerID, false)
	e.applyAfterDisconnect(e.room)
	e.broadcastState(e.room)
}

func (e *Engine) Close() {
	if e.room == nil {
		return
	}
	e.broadcast(e.room, protocol.NoticeMessage(protocol.Notice{Kind: "closed"}))
	for _, item := range e.room.clients {
		item.Close()
	}
	e.room = nil
}

func (e *Engine) Closed() bool {
	return e.room == nil
}

func (e *Engine) applyResult(live *liveRoom, result Result) {
	if result.Phase != nil {
		live.Phase = *result.Phase
	}
	if result.Payload != nil {
		live.Payload = result.Payload
	}
	if result.Scores != nil {
		live.Session.Scores = result.Scores
	}
	if result.StartedAt != nil {
		live.Session.StartedAt = *result.StartedAt
	}
	for _, notice := range result.Notices {
		e.broadcast(live, protocol.NoticeMessage(notice))
	}
}

func (e *Engine) applyAfterDisconnect(live *liveRoom) {
	result := live.driver.AfterDisconnect(live.Payload, live.Session.Players, live.Session.Scores)
	if result == nil {
		return
	}
	e.applyResult(live, *result)
}

func (e *Engine) removePlayer(live *liveRoom, playerID string) {
	next := live.Session.Players[:0]
	for _, player := range live.Session.Players {
		if player.ID != playerID {
			next = append(next, player)
		}
	}
	live.Session.Players = next
	delete(live.Session.Scores, playerID)
	payload, err := live.driver.OnPlayerRemoved(live.Payload, playerID)
	if err == nil {
		live.Payload = payload
	}
	e.applyAfterDisconnect(live)
}

func (e *Engine) attach(wire WireClient, live *liveRoom, player protocol.RoomPlayer, deviceID string) *client {
	for key, item := range live.clients {
		if item.deviceID == deviceID && key != wire.Key() {
			delete(live.clients, key)
			item.Close()
		}
	}
	role := protocol.RolePlayer
	if player.IsHost {
		role = protocol.RoleHost
	}
	next := &client{
		WireClient: wire,
		deviceID:   deviceID,
		playerID:   player.ID,
		role:       role,
	}
	live.clients[wire.Key()] = next
	setConnected(live, player.ID, true)
	wire.Send(protocol.HelloMessage(next.playerID, next.role, e.snapshotFor(live, next)))
	e.broadcastState(live)
	return next
}

func (e *Engine) requireHost(item *client) bool {
	return item != nil && item.role == protocol.RoleHost && item.playerID == e.room.HostPlayerID
}

func (e *Engine) broadcast(live *liveRoom, message protocol.ServerMessage) {
	for _, item := range live.clients {
		item.Send(message)
	}
}

func (e *Engine) broadcastState(live *liveRoom) {
	for _, item := range live.clients {
		snap := e.snapshotFor(live, item)
		item.Send(protocol.StateMessage(snap))
	}
}

func (e *Engine) snapshotFor(live *liveRoom, item *client) protocol.RoomSnapshot {
	payload, err := live.driver.ToClientPayload(live.Payload, live.Phase, Viewer{
		PlayerID: item.playerID,
		IsHost:   item.role == protocol.RoleHost,
	})
	if err != nil {
		payload = live.Payload
	}
	return clonejson.Clone(protocol.RoomSnapshot{
		Code:    live.Code,
		GameID:  live.GameID,
		ThemeID: live.ThemeID,
		Phase:   live.Phase,
		Session: live.Session,
		Payload: payload,
	})
}

func addPlayer(live *liveRoom, name, deviceID string, isHost bool) protocol.RoomPlayer {
	player := protocol.RoomPlayer{
		ID:        ids.New("player"),
		Name:      name,
		DeviceID:  deviceID,
		Connected: true,
		IsHost:    isHost,
	}
	live.Session.Players = append(live.Session.Players, player)
	if live.Session.Scores == nil {
		live.Session.Scores = map[string]int{}
	}
	live.Session.Scores[player.ID] = 0
	return player
}

func findByDevice(live *liveRoom, deviceID string) *protocol.RoomPlayer {
	for i := range live.Session.Players {
		if live.Session.Players[i].DeviceID == deviceID {
			return &live.Session.Players[i]
		}
	}
	return nil
}

func setConnected(live *liveRoom, playerID string, connected bool) {
	for i := range live.Session.Players {
		if live.Session.Players[i].ID == playerID {
			live.Session.Players[i].Connected = connected
			return
		}
	}
}
