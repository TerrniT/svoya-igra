package room

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"strings"
	"sync"
	"unicode"

	"svoya-igra/internal/config"
	"svoya-igra/internal/gamekit"
	"svoya-igra/internal/ids"
	"svoya-igra/internal/protocol"
	"svoya-igra/internal/text"
)

type Catalog interface {
	Resolve(id string) (gamekit.Module, error)
}

type command struct {
	kind   string
	client WireClient
	raw    json.RawMessage
	create *createArgs
	done   chan error
}

type createArgs struct {
	name     string
	deviceID string
	gameID   string
	themeID  string
	settings json.RawMessage
}

type Room struct {
	code   string
	engine *Engine
	inbox  chan command
}

type Hub struct {
	mu         sync.Mutex
	rooms      map[string]*Room
	membership map[string]*Room
	catalog    Catalog
	cfg        config.Config
}

func NewHub(catalog Catalog, cfg config.Config) *Hub {
	return &Hub{
		rooms:      map[string]*Room{},
		membership: map[string]*Room{},
		catalog:    catalog,
		cfg:        cfg,
	}
}

func (h *Hub) Dispatch(client WireClient, raw json.RawMessage) {
	var head struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(raw, &head); err != nil {
		client.Send(protocol.ErrorMessage(text.BadMessage))
		return
	}

	h.mu.Lock()
	current := h.membership[client.Key()]
	h.mu.Unlock()

	switch head.Type {
	case "create":
		if current != nil {
			client.Send(protocol.ErrorMessage(text.LeaveRoomFirst))
			return
		}
		h.create(client, raw)
		return
	case "join", "reconnect":
		if current != nil {
			client.Send(protocol.ErrorMessage(text.LeaveRoomFirst))
			return
		}
		h.enter(client, raw, head.Type)
		return
	}

	if current == nil {
		client.Send(protocol.ErrorMessage(text.JoinRoomFirst))
		return
	}
	err := current.call(command{kind: "msg", client: client, raw: raw})
	if err != nil {
		client.Send(protocol.ErrorMessage(err.Error()))
	}
	h.forgetIfClosed(current)
}

func (h *Hub) Drop(client WireClient) {
	h.mu.Lock()
	current := h.membership[client.Key()]
	delete(h.membership, client.Key())
	h.mu.Unlock()
	if current == nil {
		return
	}
	_ = current.call(command{kind: "drop", client: client})
	h.forgetIfClosed(current)
}

func (h *Hub) create(client WireClient, raw json.RawMessage) {
	var msg struct {
		Name     string          `json:"name"`
		DeviceID string          `json:"deviceId"`
		GameID   string          `json:"gameId"`
		ThemeID  string          `json:"themeId"`
		Settings json.RawMessage `json:"settings"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		client.Send(protocol.ErrorMessage(text.BadMessage))
		return
	}
	name := strings.TrimSpace(msg.Name)
	if name == "" {
		client.Send(protocol.ErrorMessage(text.HostNameRequired))
		return
	}
	if strings.TrimSpace(msg.DeviceID) == "" {
		client.Send(protocol.ErrorMessage(text.DeviceRequired))
		return
	}
	module, err := h.catalog.Resolve(msg.GameID)
	if err != nil {
		client.Send(protocol.ErrorMessage(err.Error()))
		return
	}
	settings, err := module.NormalizeSettings(msg.Settings)
	if err != nil {
		client.Send(protocol.ErrorMessage(err.Error()))
		return
	}

	h.mu.Lock()
	code, err := h.uniqueCode()
	if err != nil {
		h.mu.Unlock()
		client.Send(protocol.ErrorMessage(err.Error()))
		return
	}
	live := &Room{
		code:   code,
		engine: NewEngine(module.Driver()),
		inbox:  make(chan command, 256),
	}
	h.rooms[code] = live
	h.mu.Unlock()
	go live.loop()

	err = live.call(command{
		kind:   "create",
		client: client,
		create: &createArgs{
			name:     name,
			deviceID: msg.DeviceID,
			gameID:   msg.GameID,
			themeID:  msg.ThemeID,
			settings: settings,
		},
	})
	if err != nil {
		h.removeRoom(live)
		client.Send(protocol.ErrorMessage(err.Error()))
		return
	}
	h.mu.Lock()
	h.membership[client.Key()] = live
	h.mu.Unlock()
}

func (h *Hub) enter(client WireClient, raw json.RawMessage, kind string) {
	var msg struct {
		Code     string `json:"code"`
		DeviceID string `json:"deviceId"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		client.Send(protocol.ErrorMessage(text.BadMessage))
		return
	}
	code := NormalizeCode(msg.Code)
	h.mu.Lock()
	live := h.rooms[code]
	h.mu.Unlock()
	if live == nil {
		if kind == "reconnect" {
			client.Send(protocol.ErrorMessage(text.ReconnectFailed))
			return
		}
		client.Send(protocol.ErrorMessage(text.RoomMissing))
		return
	}
	err := live.call(command{kind: "msg", client: client, raw: raw})
	if err != nil {
		client.Send(protocol.ErrorMessage(err.Error()))
		return
	}
	if live.engine.Closed() {
		h.removeRoom(live)
		return
	}
	h.mu.Lock()
	h.membership[client.Key()] = live
	h.mu.Unlock()
}

func (h *Hub) forgetIfClosed(live *Room) {
	if live == nil || live.engine == nil || !live.engine.Closed() {
		return
	}
	h.removeRoom(live)
}

func (h *Hub) removeRoom(live *Room) {
	h.mu.Lock()
	if current, ok := h.rooms[live.code]; ok && current == live {
		delete(h.rooms, live.code)
	}
	for key, item := range h.membership {
		if item == live {
			delete(h.membership, key)
		}
	}
	h.mu.Unlock()
	live.stop()
}

func (r *Room) loop() {
	for cmd := range r.inbox {
		var err error
		switch cmd.kind {
		case "create":
			err = r.engine.Create(r.code, cmd.create.name, cmd.create.deviceID, cmd.create.gameID, cmd.create.themeID, cmd.create.settings, cmd.client)
		case "msg":
			err = r.engine.Handle(cmd.client, cmd.raw)
		case "drop":
			r.engine.Disconnect(cmd.client.Key())
		}
		if cmd.done != nil {
			cmd.done <- err
		}
	}
}

func (r *Room) call(cmd command) (err error) {
	defer func() {
		if recover() != nil {
			err = text.Error(text.RoomClosed)
		}
	}()
	cmd.done = make(chan error, 1)
	r.inbox <- cmd
	return <-cmd.done
}

func (r *Room) stop() {
	defer func() { _ = recover() }()
	close(r.inbox)
}

func (h *Hub) uniqueCode() (string, error) {
	for i := 0; i < 32; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(10000))
		if err != nil {
			return "", text.Error(text.RoomCreateFailed)
		}
		code := fmt.Sprintf("%04d", n.Int64())
		if _, exists := h.rooms[code]; !exists {
			return code, nil
		}
	}
	return "", text.Error(text.RoomCodeBusy)
}

func NormalizeCode(code string) string {
	digits := make([]rune, 0, 4)
	for _, r := range code {
		if unicode.IsDigit(r) {
			digits = append(digits, r)
		}
	}
	for len(digits) < 4 {
		digits = append([]rune{'0'}, digits...)
	}
	if len(digits) > 4 {
		digits = digits[len(digits)-4:]
	}
	return string(digits)
}

func NewClientKey() string {
	return ids.New("conn")
}
