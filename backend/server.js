"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");
let Pool = null;

try {
  ({ Pool } = require("pg"));
} catch (_error) {
  Pool = null;
}

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "data");
const PUBLIC_DIR = ROOT_DIR;

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "127.0.0.1";
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);
const MAX_BODY_BYTES = 1024 * 1024;
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

const FILES = {
  users: path.join(DATA_DIR, "users.json"),
  sessions: path.join(DATA_DIR, "sessions.json"),
  carts: path.join(DATA_DIR, "carts.json"),
  wishlists: path.join(DATA_DIR, "wishlists.json"),
  orders: path.join(DATA_DIR, "orders.json")
};

const STORE_DEFAULTS = {
  users: [],
  sessions: [],
  carts: {},
  wishlists: {},
  orders: []
};

const FILE_KEY_MAP = new Map(Object.entries(FILES).map(([key, file]) => [file, key]));

const storageState = {
  users: [],
  sessions: [],
  carts: {},
  wishlists: {},
  orders: []
};

let storageMode = "file";
let dbPool = null;
let pendingPersist = Promise.resolve();
let persistenceError = "";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8"
};

const catalog = loadCatalogData();
const products = Array.isArray(catalog.products) ? catalog.products : [];

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url || !req.method) {
      sendJson(res, 400, { error: "Invalid request" });
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith("/api/")) {
      if (req.method === "OPTIONS") {
        sendJson(res, 204, {});
        return;
      }
      await handleApi(req, res, pathname, url);
      return;
    }

    serveStatic(req, res, pathname);
  } catch (error) {
    sendJson(res, 500, { error: "Internal server error", detail: String(error.message || error) });
  }
});

void bootstrap();

async function bootstrap() {
  try {
    await initPersistence();

    server.listen(PORT, HOST, () => {
      // eslint-disable-next-line no-console
      console.log(`BrandsHub49 backend running on http://${HOST}:${PORT}`);
      // eslint-disable-next-line no-console
      console.log(`Persistence mode: ${storageMode}${storageMode === "postgres" ? " (PostgreSQL)" : " (JSON files)"}`);
    });

    setupGracefulShutdown();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Failed to start backend: ${String(error.message || error)}`);
    process.exit(1);
  }
}

async function initPersistence() {
  ensureDataFiles();

  if (!DATABASE_URL) {
    storageMode = "file";
    persistenceError = "";
    return;
  }

  if (!Pool) {
    // eslint-disable-next-line no-console
    console.error("DATABASE_URL is set but 'pg' is not installed. Falling back to JSON file storage.");
    storageMode = "file";
    persistenceError = "DATABASE_URL is set but 'pg' package is unavailable.";
    return;
  }

  const ssl = resolveSslConfig();
  const options = { connectionString: DATABASE_URL };
  if (ssl !== null) {
    options.ssl = ssl;
  }

  try {
    dbPool = new Pool(options);
    await dbPool.query("SELECT 1");
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS app_store (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const [key, fallback] of Object.entries(STORE_DEFAULTS)) {
      const row = await dbPool.query("SELECT value FROM app_store WHERE key = $1", [key]);

      if (!row.rows.length) {
        const seed = deepClone(fallback);
        storageState[key] = seed;
        await dbPool.query(
          `
          INSERT INTO app_store (key, value, updated_at)
          VALUES ($1, $2::jsonb, NOW())
          ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value, updated_at = NOW()
          `,
          [key, JSON.stringify(seed)]
        );
        continue;
      }

      storageState[key] = normalizeStoreValue(key, row.rows[0].value, fallback);
    }

    storageMode = "postgres";
    persistenceError = "";
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`PostgreSQL init failed (${String(error.message || error)}). Falling back to JSON file storage.`);
    storageMode = "file";
    persistenceError = String(error.message || error);
    if (dbPool) {
      try {
        await dbPool.end();
      } catch (_closeError) {
        // No-op
      }
      dbPool = null;
    }
  }
}

function resolveSslConfig() {
  const raw = String(process.env.DB_SSL || "require").trim().toLowerCase();
  if (!raw || raw === "disable" || raw === "false" || raw === "off") {
    return null;
  }
  return { rejectUnauthorized: false };
}

function normalizeStoreValue(key, value, fallback) {
  if (key === "carts" || key === "wishlists") {
    return value && typeof value === "object" && !Array.isArray(value) ? value : deepClone(fallback);
  }

  if (Array.isArray(fallback)) {
    return Array.isArray(value) ? value : deepClone(fallback);
  }

  return value ?? deepClone(fallback);
}

function schedulePersist(key) {
  if (storageMode !== "postgres" || !dbPool) return;

  const snapshot = JSON.stringify(deepClone(storageState[key]));
  pendingPersist = pendingPersist
    .then(async () => {
      await dbPool.query(
        `
        INSERT INTO app_store (key, value, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = NOW()
        `,
        [key, snapshot]
      );
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(`Failed to persist key '${key}': ${String(error.message || error)}`);
    });
}

async function flushPendingWrites() {
  try {
    await pendingPersist;
  } catch (_error) {
    // No-op
  }
}

function setupGracefulShutdown() {
  const shutdown = async () => {
    await flushPendingWrites();

    if (dbPool) {
      try {
        await dbPool.end();
      } catch (_error) {
        // No-op
      }
    }

    process.exit(0);
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  ensureFile(FILES.users, []);
  ensureFile(FILES.sessions, []);
  ensureFile(FILES.carts, {});
  ensureFile(FILES.wishlists, {});
  ensureFile(FILES.orders, []);
}

function ensureFile(file, fallback) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return;
  }

  try {
    const content = fs.readFileSync(file, "utf8");
    JSON.parse(content);
  } catch (_error) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
  }
}

function readJson(file, fallback) {
  const key = FILE_KEY_MAP.get(file);
  if (storageMode === "postgres" && key) {
    const value = storageState[key];
    if (typeof value === "undefined") {
      return deepClone(fallback);
    }
    return deepClone(value);
  }

  try {
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw);
  } catch (_error) {
    return fallback;
  }
}

function writeJson(file, value) {
  const key = FILE_KEY_MAP.get(file);
  if (storageMode === "postgres" && key) {
    storageState[key] = deepClone(value);
    schedulePersist(key);
    return;
  }

  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function loadCatalogData() {
  const dataFile = path.join(ROOT_DIR, "assets", "js", "data.js");

  if (!fs.existsSync(dataFile)) {
    return { products: [], heroSlides: [], featuredCollections: [], blogPosts: [] };
  }

  const code = fs.readFileSync(dataFile, "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { timeout: 2000 });

  return (
    sandbox.window.BRANDS_HUB_DATA ||
    sandbox.window.LUXURY_WATCH_DATA || {
      products: [],
      heroSlides: [],
      featuredCollections: [],
      blogPosts: []
    }
  );
}

function sendJson(res, statusCode, payload) {
  const body = statusCode === 204 ? "" : JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Cache-Control": "no-store"
  };

  if (body) {
    headers["Content-Length"] = Buffer.byteLength(body);
  }

  res.writeHead(statusCode, headers);
  if (body) {
    res.end(body);
  } else {
    res.end();
  }
}

function serveStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const normalized = path.normalize(requestedPath).replace(/^([.][.][/\\])+/, "");
  const resolved = path.resolve(PUBLIC_DIR, `.${normalized}`);

  if (!resolved.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  let filePath = resolved;

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(res, 404, "Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || "application/octet-stream";
  const content = fs.readFileSync(filePath);

  res.writeHead(200, {
    "Content-Type": mime,
    "Content-Length": content.length
  });
  res.end(content);
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(message)
  });
  res.end(message);
}

async function handleApi(req, res, pathname, url) {
  const method = req.method.toUpperCase();

  if (pathname === "/api/health" && method === "GET") {
    const persistence = {
      mode: storageMode,
      databaseConfigured: Boolean(DATABASE_URL)
    };
    if (persistence.databaseConfigured && storageMode !== "postgres" && persistenceError) {
      persistence.error = persistenceError;
    }

    sendJson(res, 200, {
      ok: true,
      service: "BrandsHub49 API",
      timestamp: new Date().toISOString(),
      persistence
    });
    return;
  }

  if (pathname === "/api/content" && method === "GET") {
    sendJson(res, 200, {
      heroSlides: catalog.heroSlides || [],
      featuredCollections: catalog.featuredCollections || [],
      blogPosts: catalog.blogPosts || []
    });
    return;
  }

  if (pathname === "/api/collections" && method === "GET") {
    const collections = [...new Set(products.map((item) => item.collection).filter(Boolean))].sort();
    sendJson(res, 200, { collections });
    return;
  }

  if (pathname === "/api/products" && method === "GET") {
    sendJson(res, 200, filterProducts(url.searchParams));
    return;
  }

  if (pathname.startsWith("/api/products/") && method === "GET") {
    const productId = pathname.split("/").pop();
    const product = products.find((item) => item.id === productId);
    if (!product) {
      sendJson(res, 404, { error: "Product not found" });
      return;
    }
    sendJson(res, 200, { product });
    return;
  }

  if (pathname === "/api/auth/register" && method === "POST") {
    const body = await parseJsonBody(req, res);
    if (!body) return;

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const phone = String(body.phone || "").trim();

    if (!name || !email || !password) {
      sendJson(res, 400, { error: "name, email and password are required" });
      return;
    }

    const users = readJson(FILES.users, []);
    if (users.some((item) => item.email === email)) {
      sendJson(res, 409, { error: "Email already registered" });
      return;
    }

    const { hash, salt } = hashPassword(password);
    const user = {
      id: `user_${crypto.randomBytes(8).toString("hex")}`,
      name,
      email,
      phone,
      address: "",
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: new Date().toISOString()
    };

    users.push(user);
    writeJson(FILES.users, users);

    const sessions = clearExpiredSessions(readJson(FILES.sessions, []));
    const token = createSessionToken();
    sessions.push({
      token,
      userId: user.id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    });
    writeJson(FILES.sessions, sessions);

    sendJson(res, 201, { token, user: publicUser(user) });
    return;
  }

  if (pathname === "/api/auth/login" && method === "POST") {
    const body = await parseJsonBody(req, res);
    if (!body) return;

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    const users = readJson(FILES.users, []);
    const user = users.find((item) => item.email === email);

    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      sendJson(res, 401, { error: "Invalid email or password" });
      return;
    }

    const sessions = clearExpiredSessions(readJson(FILES.sessions, []));
    const token = createSessionToken();
    sessions.push({
      token,
      userId: user.id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    });
    writeJson(FILES.sessions, sessions);

    sendJson(res, 200, { token, user: publicUser(user) });
    return;
  }

  if (pathname === "/api/auth/logout" && method === "POST") {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const sessions = clearExpiredSessions(readJson(FILES.sessions, []));
    const nextSessions = sessions.filter((item) => item.token !== auth.token);
    writeJson(FILES.sessions, nextSessions);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/auth/me" && method === "GET") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    sendJson(res, 200, { user: publicUser(auth.user) });
    return;
  }

  if (pathname === "/api/account/profile" && method === "GET") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    sendJson(res, 200, { user: publicUser(auth.user) });
    return;
  }

  if (pathname === "/api/account/profile" && method === "PUT") {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const body = await parseJsonBody(req, res);
    if (!body) return;

    const users = readJson(FILES.users, []);
    const idx = users.findIndex((item) => item.id === auth.user.id);
    if (idx < 0) {
      sendJson(res, 404, { error: "User not found" });
      return;
    }

    const candidateEmail = body.email ? String(body.email).trim().toLowerCase() : users[idx].email;
    const emailUsed = users.some(
      (item) => item.email === candidateEmail && item.id !== auth.user.id
    );

    if (emailUsed) {
      sendJson(res, 409, { error: "Email already in use" });
      return;
    }

    users[idx].name = body.name ? String(body.name).trim() : users[idx].name;
    users[idx].phone = body.phone ? String(body.phone).trim() : users[idx].phone;
    users[idx].address =
      typeof body.address === "string" ? body.address.trim() : users[idx].address;
    users[idx].email = candidateEmail;

    writeJson(FILES.users, users);

    sendJson(res, 200, { user: publicUser(users[idx]) });
    return;
  }

  if (pathname === "/api/cart" && method === "GET") {
    const auth = requireAuth(req, res);
    if (!auth) return;

    sendJson(res, 200, buildCartResponse(auth.user.id));
    return;
  }

  if (pathname === "/api/cart" && method === "PUT") {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const body = await parseJsonBody(req, res);
    if (!body) return;

    if (!Array.isArray(body.items)) {
      sendJson(res, 400, { error: "items must be an array" });
      return;
    }

    const carts = readJson(FILES.carts, {});
    carts[auth.user.id] = sanitizeCartItems(body.items);
    writeJson(FILES.carts, carts);

    sendJson(res, 200, buildCartResponse(auth.user.id));
    return;
  }

  if (pathname === "/api/cart/items" && method === "POST") {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const body = await parseJsonBody(req, res);
    if (!body) return;

    const productId = String(body.id || body.productId || "").trim();
    const qty = Number(body.qty || 1);
    const product = products.find((item) => item.id === productId);

    if (!product) {
      sendJson(res, 404, { error: "Product not found" });
      return;
    }

    const carts = readJson(FILES.carts, {});
    const items = Array.isArray(carts[auth.user.id]) ? carts[auth.user.id] : [];

    const color = String(body.color || product.colors?.[0] || "Default");
    const strap = String(body.strap || product.strapOptions?.[0] || "Standard");

    const existing = items.find(
      (item) => item.id === productId && item.color === color && item.strap === strap
    );

    if (existing) {
      existing.qty += Number.isFinite(qty) && qty > 0 ? qty : 1;
    } else {
      items.push({
        id: productId,
        qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
        color,
        strap
      });
    }

    carts[auth.user.id] = sanitizeCartItems(items);
    writeJson(FILES.carts, carts);

    sendJson(res, 200, buildCartResponse(auth.user.id));
    return;
  }

  if (pathname.startsWith("/api/cart/items/") && method === "DELETE") {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const productId = pathname.split("/").pop();
    const color = url.searchParams.get("color");
    const strap = url.searchParams.get("strap");

    const carts = readJson(FILES.carts, {});
    const items = Array.isArray(carts[auth.user.id]) ? carts[auth.user.id] : [];

    carts[auth.user.id] = items.filter((item) => {
      if (item.id !== productId) return true;
      if (color && item.color !== color) return true;
      if (strap && item.strap !== strap) return true;
      return false;
    });

    writeJson(FILES.carts, carts);

    sendJson(res, 200, buildCartResponse(auth.user.id));
    return;
  }

  if (pathname === "/api/wishlist" && method === "GET") {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const wishlists = readJson(FILES.wishlists, {});
    const ids = Array.isArray(wishlists[auth.user.id]) ? wishlists[auth.user.id] : [];
    const items = ids.map((id) => products.find((item) => item.id === id)).filter(Boolean);

    sendJson(res, 200, { ids, items });
    return;
  }

  if (pathname === "/api/wishlist" && method === "POST") {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const body = await parseJsonBody(req, res);
    if (!body) return;

    const productId = String(body.productId || body.id || "").trim();
    if (!products.some((item) => item.id === productId)) {
      sendJson(res, 404, { error: "Product not found" });
      return;
    }

    const wishlists = readJson(FILES.wishlists, {});
    const ids = Array.isArray(wishlists[auth.user.id]) ? wishlists[auth.user.id] : [];

    if (!ids.includes(productId)) {
      ids.push(productId);
    }

    wishlists[auth.user.id] = ids;
    writeJson(FILES.wishlists, wishlists);

    const items = ids.map((id) => products.find((item) => item.id === id)).filter(Boolean);
    sendJson(res, 200, { ids, items });
    return;
  }

  if (pathname.startsWith("/api/wishlist/") && method === "DELETE") {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const productId = pathname.split("/").pop();
    const wishlists = readJson(FILES.wishlists, {});
    const ids = Array.isArray(wishlists[auth.user.id]) ? wishlists[auth.user.id] : [];

    wishlists[auth.user.id] = ids.filter((id) => id !== productId);
    writeJson(FILES.wishlists, wishlists);

    const nextIds = wishlists[auth.user.id];
    const items = nextIds.map((id) => products.find((item) => item.id === id)).filter(Boolean);
    sendJson(res, 200, { ids: nextIds, items });
    return;
  }

  if (pathname === "/api/orders" && method === "GET") {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const orders = readJson(FILES.orders, []).filter((item) => item.userId === auth.user.id);
    orders.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    sendJson(res, 200, { orders });
    return;
  }

  if (pathname === "/api/orders" && method === "POST") {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const body = await parseJsonBody(req, res);
    if (!body) return;

    const carts = readJson(FILES.carts, {});
    const cartItems = Array.isArray(carts[auth.user.id]) ? carts[auth.user.id] : [];

    const requestedItems = Array.isArray(body.items) ? sanitizeCartItems(body.items) : cartItems;
    if (!requestedItems.length) {
      sendJson(res, 400, { error: "No items to place order" });
      return;
    }

    const lineItems = requestedItems
      .map((item) => {
        const product = products.find((p) => p.id === item.id);
        if (!product) return null;
        return {
          ...item,
          name: product.name,
          price: product.price,
          lineTotal: product.price * item.qty
        };
      })
      .filter(Boolean);

    const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const shippingCharge =
      Number.isFinite(Number(body.shippingCharge)) && Number(body.shippingCharge) >= 0
        ? Number(body.shippingCharge)
        : 99;
    const total = subtotal + shippingCharge;

    const orderId = `BH49-${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
    const order = {
      id: orderId,
      userId: auth.user.id,
      status: "Processing",
      createdAt: new Date().toISOString(),
      shippingCharge,
      subtotal,
      total,
      paymentMethod: body.paymentMethod || "Cash On Delivery",
      deliveryOption: body.deliveryOption || "Standard Delivery",
      shippingInfo: body.shippingInfo || {},
      billingInfo: body.billingInfo || {},
      notes: body.notes || "",
      items: lineItems
    };

    const orders = readJson(FILES.orders, []);
    orders.unshift(order);
    writeJson(FILES.orders, orders);

    carts[auth.user.id] = [];
    writeJson(FILES.carts, carts);

    sendJson(res, 201, { order });
    return;
  }

  sendJson(res, 404, { error: "API route not found" });
}

function requireAuth(req, res) {
  const token = getBearerToken(req);
  if (!token) {
    sendJson(res, 401, { error: "Missing auth token" });
    return null;
  }

  const sessions = clearExpiredSessions(readJson(FILES.sessions, []));
  writeJson(FILES.sessions, sessions);

  const session = sessions.find((item) => item.token === token);
  if (!session) {
    sendJson(res, 401, { error: "Invalid or expired auth token" });
    return null;
  }

  const users = readJson(FILES.users, []);
  const user = users.find((item) => item.id === session.userId);
  if (!user) {
    sendJson(res, 401, { error: "User not found for token" });
    return null;
  }

  return { user, token, session };
}

function getBearerToken(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

function clearExpiredSessions(sessions) {
  const now = Date.now();
  return sessions.filter((item) => {
    const expires = new Date(item.expiresAt).getTime();
    return Number.isFinite(expires) && expires > now;
  });
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    address: user.address || "",
    createdAt: user.createdAt
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expectedHash, "hex"));
}

function sanitizeCartItems(items) {
  return items
    .map((item) => ({
      id: String(item.id || item.productId || "").trim(),
      qty: Math.max(1, Number(item.qty || 1)),
      color: String(item.color || "Default"),
      strap: String(item.strap || "Standard")
    }))
    .filter((item) => item.id && Number.isFinite(item.qty));
}

function buildCartResponse(userId) {
  const carts = readJson(FILES.carts, {});
  const items = Array.isArray(carts[userId]) ? carts[userId] : [];

  const lineItems = items
    .map((item) => {
      const product = products.find((entry) => entry.id === item.id);
      if (!product) return null;
      const lineTotal = product.price * item.qty;
      return {
        ...item,
        product,
        lineTotal
      };
    })
    .filter(Boolean);

  const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);

  return {
    items: lineItems,
    subtotal,
    currency: "INR"
  };
}

function filterProducts(searchParams) {
  let items = [...products];

  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const minPrice = Number(searchParams.get("minPrice") || "0");
  const maxPrice = Number(searchParams.get("maxPrice") || "0");
  const rating = Number(searchParams.get("rating") || "0");
  const sort = (searchParams.get("sort") || "best").toLowerCase();

  if (q) {
    items = items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        String(item.collection || "").toLowerCase().includes(q)
    );
  }

  if (Number.isFinite(minPrice) && minPrice > 0) {
    items = items.filter((item) => item.price >= minPrice);
  }

  if (Number.isFinite(maxPrice) && maxPrice > 0) {
    items = items.filter((item) => item.price <= maxPrice);
  }

  if (Number.isFinite(rating) && rating > 0) {
    items = items.filter((item) => Number(item.rating || 0) >= rating);
  }

  const equalityFilters = [
    ["brand", "brand"],
    ["strapType", "strapType"],
    ["type", "type"],
    ["gender", "gender"],
    ["collection", "collection"]
  ];

  equalityFilters.forEach(([queryKey, field]) => {
    const value = (searchParams.get(queryKey) || "").trim();
    if (!value) return;

    const accepted = value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    if (!accepted.length) return;
    items = items.filter((item) => accepted.includes(String(item[field] || "").toLowerCase()));
  });

  switch (sort) {
    case "newest":
      items.sort((a, b) => Number(Boolean(b.isNew)) - Number(Boolean(a.isNew)) || b.price - a.price);
      break;
    case "price-asc":
      items.sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      items.sort((a, b) => b.price - a.price);
      break;
    case "best":
    default:
      items.sort(
        (a, b) =>
          Number(Boolean(b.isTopSelling)) - Number(Boolean(a.isTopSelling)) ||
          Number(b.rating || 0) - Number(a.rating || 0)
      );
      break;
  }

  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit") || "12")));

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const pagedItems = items.slice(start, start + limit);

  return {
    items: pagedItems,
    total,
    page,
    limit,
    totalPages
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseJsonBody(req, res) {
  return new Promise((resolve) => {
    const chunks = [];
    let received = 0;

    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        sendJson(res, 413, { error: "Payload too large" });
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }

      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed);
      } catch (_error) {
        sendJson(res, 400, { error: "Invalid JSON body" });
        resolve(null);
      }
    });

    req.on("error", () => {
      sendJson(res, 400, { error: "Unable to read request body" });
      resolve(null);
    });
  });
}
