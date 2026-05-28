package config

import (
	"os"
	"strings"
)

type Config struct {
	Port          string
	DatabaseURL   string
	JWTSecret     string
	AdminEmail    string
	AdminPassword string
	AllowedOrigins []string
}

func Load() Config {
	return Config{
		Port:          env("PORT", "8089"),
		DatabaseURL:   env("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/nexone_landing?sslmode=disable"),
		JWTSecret:     env("JWT_SECRET", "change-this-secret"),
		AdminEmail:    env("ADMIN_EMAIL", "admin@nexone.local"),
		AdminPassword: env("ADMIN_PASSWORD", "Admin123!"),
		AllowedOrigins: splitOrigins(env("ALLOWED_ORIGINS", "http://127.0.0.1:8088,http://localhost:8088,http://127.0.0.1:5174,http://localhost:5174")),
	}
}

func env(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func splitOrigins(value string) []string {
	parts := strings.Split(value, ",")
	origins := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			origins = append(origins, part)
		}
	}
	return origins
}
