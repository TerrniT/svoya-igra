package room

import (
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"svoya-igra/internal/protocol"
)

type SocketClient struct {
	key  string
	conn *websocket.Conn
	send chan protocol.ServerMessage
	once sync.Once
	hub  *Hub
}

func (h *Hub) newSocket(conn *websocket.Conn) *SocketClient {
	return &SocketClient{
		key:  NewClientKey(),
		conn: conn,
		send: make(chan protocol.ServerMessage, 256),
		hub:  h,
	}
}

func (c *SocketClient) Key() string { return c.key }

func (c *SocketClient) Send(message protocol.ServerMessage) {
	defer func() { _ = recover() }()
	c.send <- message
}

func (c *SocketClient) Close() {
	c.once.Do(func() {
		close(c.send)
	})
}

func (c *SocketClient) WriteLoop() {
	ticker := time.NewTicker(c.hub.cfg.PingInterval)
	defer ticker.Stop()
	defer c.conn.Close()
	for {
		select {
		case msg, ok := <-c.send:
			if !ok {
				return
			}
			_ = c.conn.SetWriteDeadline(time.Now().Add(c.hub.cfg.WriteTimeout))
			if err := c.conn.WriteJSON(msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(c.hub.cfg.WriteTimeout))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (h *Hub) HandleWS(w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			if origin == "" {
				return true
			}
			return h.cfg.AllowOrigin(origin)
		},
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade: %v", err)
		return
	}
	client := h.newSocket(conn)
	defer func() {
		h.Drop(client)
		client.Close()
	}()
	go client.WriteLoop()
	conn.SetReadLimit(h.cfg.MaxMessageBytes)
	_ = conn.SetReadDeadline(time.Now().Add(h.cfg.ReadTimeout))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(h.cfg.ReadTimeout))
	})
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		_ = conn.SetReadDeadline(time.Now().Add(h.cfg.ReadTimeout))
		h.Dispatch(client, data)
	}
}
