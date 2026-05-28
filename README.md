# NEXONE Landing + Leads Admin

This project contains:

- `index.html` public landing page
- `backend/` Go API for lead capture and admin auth
- `admin/` React admin panel for lead management
- `docker-compose.yml` local Postgres database

## Local Run

Start Postgres:

```bash
docker compose up -d postgres
```

Run backend:

```bash
cd backend
DATABASE_URL='postgres://nexone:nexone_dev_password@127.0.0.1:5545/nexone_landing?sslmode=disable' \
JWT_SECRET='change-this-super-secret' \
ADMIN_EMAIL='admin@nexone.local' \
ADMIN_PASSWORD='Admin123!' \
PORT=8089 \
go run ./cmd/api
```

Run landing page:

```bash
python3 -m http.server 8088
```

Run admin panel:

```bash
cd admin
npm install
npm run dev
```

Open:

- Landing: `http://127.0.0.1:8088/index.html`
- Admin: `http://127.0.0.1:5174`

Default admin:

- Email: `admin@nexone.local`
- Password: `Admin123!`

Change `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` before production.
