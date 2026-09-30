package room

import (
	"encoding/json"
	"net"
	"net/http"
	"strings"
)

func (h *Hub) HandleJoinInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	origins := h.cfg.JoinOrigins
	if len(origins) == 0 {
		origins = advertisedOrigins(r)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"origins": origins})
}

func advertisedOrigins(r *http.Request) []string {
	proto := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		proto = "https"
	}
	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}
	hostname, port, err := net.SplitHostPort(host)
	if err != nil {
		hostname = host
		port = ""
	}
	if hostname == "localhost" || hostname == "127.0.0.1" {
		if lan := lanOrigins(proto, port); len(lan) > 0 {
			return lan
		}
	}
	return []string{proto + "://" + host}
}

func lanOrigins(proto, port string) []string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil
	}
	var origins []string
	for _, iface := range ifaces {
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			ipNet, ok := addr.(*net.IPNet)
			if !ok || ipNet.IP == nil || ipNet.IP.IsLoopback() {
				continue
			}
			ip := ipNet.IP.To4()
			if ip == nil {
				continue
			}
			host := ip.String()
			if port != "" {
				host = net.JoinHostPort(host, port)
			}
			origins = append(origins, proto+"://"+host)
		}
	}
	return origins
}
