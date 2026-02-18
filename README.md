# BrandsHub49 Watch Store

Premium watch ecommerce website with a full Node.js backend (auth, profile, cart, wishlist, orders) and responsive multi-page frontend.

## Stack

- Frontend: HTML, CSS, Vanilla JS
- Backend: Node.js (`backend/server.js`) using built-in modules only
- Data storage: JSON files (configurable with `DATA_DIR`)

## Features

- Home, shop, product detail, cart, checkout, blog, contact, account pages
- Auth system: register, login, logout, session token
- Account dashboard: profile, address, order history, wishlist
- Product APIs with filtering/sorting support
- Cart, wishlist, and orders persisted by backend

## Local Run

```bash
npm start
```

Open:

- [http://localhost:8080](http://localhost:8080)

## Important Env Vars

- `PORT` (default: `8080`)
- `HOST` (default: `127.0.0.1`)
- `DATA_DIR` (default: `backend/data`)
- `SESSION_DAYS` (default: `30`)

## GitHub Setup

1. Create a new empty repo on GitHub (for example: `brandshub49-store`).
2. Run these commands in this project:

```bash
git add .
git commit -m "Initial ecommerce website with backend"
git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO>.git
git push -u origin main
```

## Deployment Option A (Recommended): Render Full Stack

This keeps frontend + backend on one domain and supports persistent data using a disk mount.

Files already prepared:

- `render.yaml`
- `package.json` with `npm start`

Steps:

1. Push this repo to GitHub.
2. In Render, create a new Blueprint/Web Service from this repo.
3. Render will apply `render.yaml` automatically.
4. After deploy, open your Render URL.

## Deployment Option B: Vercel Frontend + Render Backend

Use this only if you want Vercel for static pages.

Files already prepared:

- `vercel.json`

Before deploying to Vercel:

1. Deploy backend on Render first.
2. Edit `vercel.json` and replace:
   - `https://YOUR_RENDER_BACKEND_DOMAIN`
   with your real Render backend domain.
3. Deploy frontend on Vercel.

This rewrite forwards frontend `/api/*` requests from Vercel to Render backend.

## Replacing Placeholder Data Later

When you send real images and product details, update:

- `assets/js/data.js` (products, images, collections, blog)
- Brand/contact copy in page HTML files and `assets/js/app.js`

