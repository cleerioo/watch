# BrandsHub49 Watch Store

Premium watch ecommerce website with full backend APIs.

## Stack

- Frontend: HTML, CSS, Vanilla JS
- Backend: Node.js (`backend/server.js`)
- Persistence:
  - PostgreSQL (recommended, via `DATABASE_URL`)
  - JSON-file fallback (if `DATABASE_URL` is not set)

## Features

- Auth: register/login/logout/session
- Account: profile + address updates
- Ecommerce: cart, wishlist, checkout, orders
- Product/content APIs and frontend pages

## Local Run

```bash
npm install
npm start
```

Open: [http://localhost:8080](http://localhost:8080)

## Env Variables

Use `.env.example` as reference.

- `PORT` default `8080`
- `HOST` default `127.0.0.1`
- `SESSION_DAYS` default `30`
- `DATABASE_URL` PostgreSQL connection string
- `DB_SSL` default `require` (`disable` for local non-SSL postgres)
- `DATA_DIR` JSON fallback directory (`backend/data` by default)

## Supabase Database Setup (Recommended)

1. Create project on [Supabase](https://supabase.com).
2. Go to `Project Settings -> Database`.
3. Copy the connection string (URI format) and use it as `DATABASE_URL`.
4. Keep `DB_SSL=require`.
5. Restart backend.

Notes:

- Backend auto-creates required table (`app_store`) and seed keys.
- You can also run SQL manually from `backend/sql/init.sql`.

## Render Deployment (Current Repo Setup)

This repo includes `render.yaml`.

Steps:

1. Push repo to GitHub.
2. Create Render Web Service from this repo.
3. In Render environment variables, set:
   - `HOST=0.0.0.0`
   - `SESSION_DAYS=30`
   - `DB_SSL=require`
   - `DATABASE_URL=<your supabase postgres uri>`
4. Deploy.

Optional fallback mode (no DB):

- Set `DATA_DIR=/tmp/brandshub49` and leave `DATABASE_URL` empty.
- This is demo-only and data is not durable on free hosting restarts.

## Vercel Frontend + Render Backend (Optional)

If using Vercel frontend, update `vercel.json` to point `/api/*` to your Render backend domain.

## Key Files

- Backend API server: `backend/server.js`
- DB bootstrap SQL: `backend/sql/init.sql`
- Frontend API integration: `assets/js/app.js`
- Render config: `render.yaml`
