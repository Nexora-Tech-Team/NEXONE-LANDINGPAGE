package main

import (
	"context"
	"log"
	"net/http"

	"nexone-landing/backend/internal/api"
	"nexone-landing/backend/internal/config"
	"nexone-landing/backend/internal/db"
)

func main() {
	cfg := config.Load()
	ctx, cancel := api.ContextWithTimeout(context.Background())
	defer cancel()

	conn, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}
	defer conn.Close()

	if err := db.Migrate(ctx, conn); err != nil {
		log.Fatalf("run migrations: %v", err)
	}
	if err := db.EnsureAdmin(ctx, conn, cfg.AdminEmail, cfg.AdminPassword, cfg.JWTSecret); err != nil {
		log.Fatalf("ensure admin: %v", err)
	}

	server := api.New(conn, cfg)
	log.Printf("NEXONE lead API listening on :%s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, server.Handler()); err != nil {
		log.Fatal(err)
	}
}
