package db

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func Open(ctx context.Context, databaseURL string) (*sql.DB, error) {
	conn, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, err
	}
	conn.SetMaxOpenConns(10)
	conn.SetMaxIdleConns(5)
	conn.SetConnMaxLifetime(30 * time.Minute)
	if err := conn.PingContext(ctx); err != nil {
		_ = conn.Close()
		return nil, err
	}
	return conn, nil
}

func Migrate(ctx context.Context, conn *sql.DB) error {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		return fmt.Errorf("resolve migration path")
	}
	root := filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
	body, err := os.ReadFile(filepath.Join(root, "migrations", "001_init.sql"))
	if err != nil {
		return err
	}
	_, err = conn.ExecContext(ctx, string(body))
	return err
}

func EnsureAdmin(ctx context.Context, conn *sql.DB, email, password, secret string) error {
	if email == "" || password == "" {
		return nil
	}
	hash := PasswordHash(password, secret)
	_, err := conn.ExecContext(ctx, `
		insert into admins (email, password_hash)
		values ($1, $2)
		on conflict (email) do nothing
	`, email, hash)
	return err
}

func PasswordHash(password, secret string) string {
	sum := sha256.Sum256([]byte(secret + ":" + password))
	return hex.EncodeToString(sum[:])
}
