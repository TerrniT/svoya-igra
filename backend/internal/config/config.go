package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Host            string
	Port            string
	WSPath          string
	CORSOrigins     []string
	JoinOrigins     []string
	MaxMessageBytes int64
	ReadTimeout     time.Duration
	WriteTimeout    time.Duration
	PingInterval    time.Duration
}

func Load() Config {
	cfg := Config{
		Host:            env("HOST", "0.0.0.0"),
		Port:            env("PORT", "8080"),
		WSPath:          env("WS_PATH", "/ws"),
		CORSOrigins:     csv(env("CORS_ORIGINS", "*")),
		JoinOrigins:     csv(env("JOIN_ORIGINS", "")),
		MaxMessageBytes: int64(envInt("MAX_MESSAGE_BYTES", 1<<20)),
		ReadTimeout:     envDuration("READ_TIMEOUT", 60*time.Second),
		WriteTimeout:    envDuration("WRITE_TIMEOUT", 8*time.Second),
		PingInterval:    envDuration("PING_INTERVAL", 20*time.Second),
	}
	if cfg.MaxMessageBytes <= 0 {
		cfg.MaxMessageBytes = 1 << 20
	}
	if cfg.ReadTimeout <= 0 {
		cfg.ReadTimeout = 60 * time.Second
	}
	if cfg.WriteTimeout <= 0 {
		cfg.WriteTimeout = 8 * time.Second
	}
	if cfg.PingInterval <= 0 {
		cfg.PingInterval = 20 * time.Second
	}
	if cfg.WSPath == "" {
		cfg.WSPath = "/ws"
	}
	return cfg
}

func (c Config) Addr() string {
	host := c.Host
	if host == "" {
		host = "0.0.0.0"
	}
	port := c.Port
	if port == "" {
		port = "8080"
	}
	if strings.HasPrefix(port, ":") {
		return host + port
	}
	return host + ":" + port
}

func (c Config) AllowOrigin(origin string) bool {
	if len(c.CORSOrigins) == 0 {
		return true
	}
	for _, allowed := range c.CORSOrigins {
		if allowed == "*" || allowed == origin {
			return true
		}
	}
	return false
}

func env(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func envInt(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func envDuration(key string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := time.ParseDuration(raw)
	if err != nil {
		return fallback
	}
	return value
}

func csv(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item != "" {
			out = append(out, item)
		}
	}
	return out
}
