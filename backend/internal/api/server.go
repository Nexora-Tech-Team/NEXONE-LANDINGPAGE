package api

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"nexone-landing/backend/internal/config"
	"nexone-landing/backend/internal/db"
)

type Server struct {
	db  *sql.DB
	cfg config.Config
}

type Lead struct {
	ID         string    `json:"id"`
	FullName   string    `json:"fullName"`
	Company    string    `json:"company"`
	Email      string    `json:"email"`
	Phone      string    `json:"phone"`
	MainNeed   string    `json:"mainNeed"`
	Message    string    `json:"message"`
	Status     string    `json:"status"`
	Source     string    `json:"source"`
	Language   string    `json:"language"`
	AdminNotes string    `json:"adminNotes"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

func New(conn *sql.DB, cfg config.Config) *Server {
	return &Server{db: conn, cfg: cfg}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/health", s.health)
	mux.HandleFunc("/api/v1/leads", s.createLead)
	mux.HandleFunc("/api/v1/auth/login", s.login)
	mux.HandleFunc("/api/v1/admin/me", s.withAuth(s.me))
	mux.HandleFunc("/api/v1/admin/dashboard", s.withAuth(s.dashboard))
	mux.HandleFunc("/api/v1/admin/leads", s.withAuth(s.listLeads))
	mux.HandleFunc("/api/v1/admin/leads/", s.withAuth(s.updateLead))
	return s.cors(mux)
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) createLead(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var input struct {
		FullName string `json:"fullName"`
		Company  string `json:"company"`
		Email    string `json:"email"`
		Phone    string `json:"phone"`
		MainNeed string `json:"mainNeed"`
		Message  string `json:"message"`
		Language string `json:"language"`
		Source   string `json:"source"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	input.FullName = strings.TrimSpace(input.FullName)
	input.Company = strings.TrimSpace(input.Company)
	input.Email = strings.TrimSpace(input.Email)
	input.MainNeed = strings.TrimSpace(input.MainNeed)
	if input.FullName == "" || input.Company == "" || input.Email == "" || input.MainNeed == "" {
		writeError(w, http.StatusBadRequest, "fullName, company, email, and mainNeed are required")
		return
	}
	if input.Language == "" {
		input.Language = "id"
	}
	if input.Source == "" {
		input.Source = "landing_page"
	}

	var lead Lead
	err := s.db.QueryRowContext(r.Context(), `
		insert into leads (full_name, company, email, phone, main_need, message, language, source)
		values ($1, $2, $3, $4, $5, $6, $7, $8)
		returning id, full_name, company, email, coalesce(phone, ''), main_need, coalesce(message, ''),
			status, source, language, coalesce(admin_notes, ''), created_at, updated_at
	`, input.FullName, input.Company, input.Email, strings.TrimSpace(input.Phone), input.MainNeed, strings.TrimSpace(input.Message), input.Language, input.Source).Scan(
		&lead.ID, &lead.FullName, &lead.Company, &lead.Email, &lead.Phone, &lead.MainNeed, &lead.Message,
		&lead.Status, &lead.Source, &lead.Language, &lead.AdminNotes, &lead.CreatedAt, &lead.UpdatedAt,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save lead")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]Lead{"lead": lead})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	var adminID, email, passwordHash string
	err := s.db.QueryRowContext(r.Context(), `select id, email, password_hash from admins where lower(email) = lower($1)`, input.Email).Scan(&adminID, &email, &passwordHash)
	if err != nil || passwordHash != db.PasswordHash(input.Password, s.cfg.JWTSecret) {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	token, err := s.signToken(adminID, email)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create token")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"admin": map[string]string{"id": adminID, "email": email},
	})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request, admin adminClaims) {
	writeJSON(w, http.StatusOK, map[string]any{"admin": admin})
}

func (s *Server) dashboard(w http.ResponseWriter, r *http.Request, admin adminClaims) {
	row := s.db.QueryRowContext(r.Context(), `
		select
			count(*) as total,
			count(*) filter (where status = 'new') as new,
			count(*) filter (where status = 'contacted') as contacted,
			count(*) filter (where status = 'qualified') as qualified,
			count(*) filter (where status = 'closed') as closed,
			count(*) filter (where status = 'lost') as lost
		from leads
	`)
	var stats struct {
		Total     int `json:"total"`
		New       int `json:"new"`
		Contacted int `json:"contacted"`
		Qualified int `json:"qualified"`
		Closed    int `json:"closed"`
		Lost      int `json:"lost"`
	}
	if err := row.Scan(&stats.Total, &stats.New, &stats.Contacted, &stats.Qualified, &stats.Closed, &stats.Lost); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load dashboard")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"stats": stats})
}

func (s *Server) listLeads(w http.ResponseWriter, r *http.Request, admin adminClaims) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	search := strings.TrimSpace(r.URL.Query().Get("q"))
	args := []any{}
	where := []string{"true"}
	if status != "" && status != "all" {
		args = append(args, status)
		where = append(where, fmt.Sprintf("status = $%d", len(args)))
	}
	if search != "" {
		args = append(args, "%"+strings.ToLower(search)+"%")
		where = append(where, fmt.Sprintf("(lower(full_name) like $%d or lower(company) like $%d or lower(email) like $%d or lower(coalesce(phone, '')) like $%d)", len(args), len(args), len(args), len(args)))
	}

	query := `
		select id, full_name, company, email, coalesce(phone, ''), main_need, coalesce(message, ''),
			status, source, language, coalesce(admin_notes, ''), created_at, updated_at
		from leads
		where ` + strings.Join(where, " and ") + `
		order by created_at desc
		limit 200
	`
	rows, err := s.db.QueryContext(r.Context(), query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load leads")
		return
	}
	defer rows.Close()

	leads := []Lead{}
	for rows.Next() {
		var lead Lead
		if err := rows.Scan(&lead.ID, &lead.FullName, &lead.Company, &lead.Email, &lead.Phone, &lead.MainNeed, &lead.Message, &lead.Status, &lead.Source, &lead.Language, &lead.AdminNotes, &lead.CreatedAt, &lead.UpdatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to read leads")
			return
		}
		leads = append(leads, lead)
	}
	writeJSON(w, http.StatusOK, map[string]any{"leads": leads})
}

func (s *Server) updateLead(w http.ResponseWriter, r *http.Request, admin adminClaims) {
	id := strings.TrimPrefix(r.URL.Path, "/api/v1/admin/leads/")
	if id == "" || strings.Contains(id, "/") {
		writeError(w, http.StatusNotFound, "lead not found")
		return
	}

	if r.Method == http.MethodDelete {
		result, err := s.db.ExecContext(r.Context(), `delete from leads where id = $1`, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to delete lead")
			return
		}
		if n, _ := result.RowsAffected(); n == 0 {
			writeError(w, http.StatusNotFound, "lead not found")
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodPatch {
		methodNotAllowed(w)
		return
	}
	var input struct {
		Status     string `json:"status"`
		AdminNotes string `json:"adminNotes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if !validStatus(input.Status) {
		writeError(w, http.StatusBadRequest, "invalid lead status")
		return
	}

	var lead Lead
	err := s.db.QueryRowContext(r.Context(), `
		update leads
		set status = $2, admin_notes = $3, updated_at = now()
		where id = $1
		returning id, full_name, company, email, coalesce(phone, ''), main_need, coalesce(message, ''),
			status, source, language, coalesce(admin_notes, ''), created_at, updated_at
	`, id, input.Status, strings.TrimSpace(input.AdminNotes)).Scan(
		&lead.ID, &lead.FullName, &lead.Company, &lead.Email, &lead.Phone, &lead.MainNeed, &lead.Message,
		&lead.Status, &lead.Source, &lead.Language, &lead.AdminNotes, &lead.CreatedAt, &lead.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "lead not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update lead")
		return
	}
	writeJSON(w, http.StatusOK, map[string]Lead{"lead": lead})
}

type adminClaims struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Exp   int64  `json:"exp"`
}

func (s *Server) signToken(id, email string) (string, error) {
	claims := adminClaims{ID: id, Email: email, Exp: time.Now().Add(24 * time.Hour).Unix()}
	body, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	payload := base64.RawURLEncoding.EncodeToString(body)
	sig := s.signature(payload)
	return payload + "." + sig, nil
}

func (s *Server) parseToken(token string) (adminClaims, error) {
	var claims adminClaims
	parts := strings.Split(token, ".")
	if len(parts) != 2 || !hmac.Equal([]byte(parts[1]), []byte(s.signature(parts[0]))) {
		return claims, errors.New("invalid token")
	}
	body, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return claims, err
	}
	if err := json.Unmarshal(body, &claims); err != nil {
		return claims, err
	}
	if time.Now().Unix() > claims.Exp {
		return claims, errors.New("expired token")
	}
	return claims, nil
}

func (s *Server) signature(payload string) string {
	mac := hmac.New(sha256.New, []byte(s.cfg.JWTSecret))
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s *Server) withAuth(next func(http.ResponseWriter, *http.Request, adminClaims)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		token := strings.TrimPrefix(header, "Bearer ")
		claims, err := s.parseToken(token)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		next(w, r, claims)
	}
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if s.originAllowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		}
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) originAllowed(origin string) bool {
	if origin == "" {
		return true
	}
	for _, allowed := range s.cfg.AllowedOrigins {
		if allowed == "*" || allowed == origin {
			return true
		}
	}
	return false
}

func validStatus(status string) bool {
	switch status {
	case "new", "contacted", "qualified", "closed", "lost":
		return true
	default:
		return false
	}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func methodNotAllowed(w http.ResponseWriter) {
	writeError(w, http.StatusMethodNotAllowed, "method not allowed")
}

func ContextWithTimeout(parent context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(parent, 10*time.Second)
}
