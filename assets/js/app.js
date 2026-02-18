(function () {
  const data = window.BRANDS_HUB_DATA || window.LUXURY_WATCH_DATA || { products: [], blogPosts: [] };
  const API_BASE = "/api";

  const STORAGE_KEYS = {
    cart: "bh49_cart",
    wishlist: "bh49_wishlist",
    users: "bh49_users",
    currentUser: "bh49_current_user",
    orders: "bh49_orders",
    authToken: "bh49_auth_token"
  };

  const currencyFormatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: data.currency || "INR",
    maximumFractionDigits: 0
  });

  let sessionBootstrapPromise = null;

  function readStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_err) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function removeStorage(key) {
    localStorage.removeItem(key);
  }

  function getAuthToken() {
    const token = readStorage(STORAGE_KEYS.authToken, "");
    return typeof token === "string" ? token : "";
  }

  function setAuthToken(token) {
    if (!token) {
      removeStorage(STORAGE_KEYS.authToken);
      return;
    }
    writeStorage(STORAGE_KEYS.authToken, token);
  }

  function hasAuthToken() {
    return Boolean(getAuthToken());
  }

  function getCart() {
    return readStorage(STORAGE_KEYS.cart, []);
  }

  function normalizeCartItems(items) {
    return (Array.isArray(items) ? items : [])
      .map((item) => ({
        id: String(item.id || item.productId || "").trim(),
        qty: Math.max(1, Number(item.qty || 1)),
        color: String(item.color || "Default"),
        strap: String(item.strap || "Standard")
      }))
      .filter((item) => item.id && Number.isFinite(item.qty));
  }

  function setCart(cart, options) {
    const opts = options || {};
    const normalized = normalizeCartItems(cart);

    writeStorage(STORAGE_KEYS.cart, normalized);
    updateCounts();

    if (!opts.skipRemote && hasAuthToken()) {
      syncCartToServer(normalized);
    }
  }

  function getWishlist() {
    return readStorage(STORAGE_KEYS.wishlist, []);
  }

  function setWishlist(ids) {
    const normalized = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id).trim()))].filter(
      Boolean
    );
    writeStorage(STORAGE_KEYS.wishlist, normalized);
    updateCounts();
  }

  function getUsers() {
    return readStorage(STORAGE_KEYS.users, []);
  }

  function setUsers(users) {
    writeStorage(STORAGE_KEYS.users, users);
  }

  function getCurrentUser() {
    return readStorage(STORAGE_KEYS.currentUser, null);
  }

  function setCurrentUser(user) {
    if (!user) {
      removeStorage(STORAGE_KEYS.currentUser);
      updateCounts();
      return;
    }

    writeStorage(STORAGE_KEYS.currentUser, {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      address: user.address || "",
      createdAt: user.createdAt || ""
    });

    updateCounts();
  }

  function getOrders() {
    return readStorage(STORAGE_KEYS.orders, []);
  }

  function setOrders(orders) {
    writeStorage(STORAGE_KEYS.orders, Array.isArray(orders) ? orders : []);
  }

  async function apiRequest(path, options) {
    const opts = options || {};
    const method = opts.method || "GET";
    const auth = opts.auth !== false;
    const maxAttempts = 3;
    let attempt = 0;
    let lastError = null;

    while (attempt < maxAttempts) {
      attempt += 1;

      try {
        const headers = {
          ...(opts.headers || {})
        };

        if (opts.body !== undefined) {
          headers["Content-Type"] = "application/json";
        }

        if (auth) {
          const token = getAuthToken();
          if (!token) {
            const missingToken = new Error("Please login to continue.");
            missingToken.status = 401;
            throw missingToken;
          }
          headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(`${API_BASE}${path}`, {
          method,
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
        });

        const text = await response.text();
        const payload = text ? safeJsonParse(text) : {};

        if (!response.ok) {
          const renderNoServer =
            response.status === 404 &&
            String(response.headers.get("x-render-routing") || "").toLowerCase() === "no-server";
          const transientStatus = [502, 503, 504].includes(response.status);
          const shouldRetry = attempt < maxAttempts && (renderNoServer || transientStatus);

          if (shouldRetry) {
            await sleep(500 * attempt);
            continue;
          }

          const message =
            (payload && (payload.error || payload.message)) || `Request failed with status ${response.status}`;
          const error = new Error(message);
          error.status = response.status;
          error.payload = payload;
          throw error;
        }

        return payload || {};
      } catch (error) {
        const networkError =
          error &&
          (error.name === "TypeError" || /network|failed to fetch|fetch/i.test(String(error.message || "")));
        const shouldRetryNetwork = networkError && attempt < maxAttempts;

        if (shouldRetryNetwork) {
          await sleep(500 * attempt);
          lastError = error;
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error("Request failed");
  }

  function safeJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch (_error) {
      return {};
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function clearAuthSession() {
    setAuthToken("");
    setCurrentUser(null);
    setCart([], { skipRemote: true });
    setWishlist([], { skipRemote: true });
    setOrders([]);
  }

  function handleAuthError(error) {
    if (error && Number(error.status) === 401) {
      clearAuthSession();
    }
  }

  function formatPrice(price) {
    return currencyFormatter.format(price);
  }

  function getProductById(id) {
    return data.products.find((item) => item.id === id);
  }

  function discountPercent(product) {
    if (!product.compareAt || product.compareAt <= product.price) return 0;
    return Math.round(((product.compareAt - product.price) / product.compareAt) * 100);
  }

  function starsMarkup(rating) {
    const full = Math.round(rating);
    return "★".repeat(full) + "☆".repeat(5 - full);
  }

  function cartCount() {
    return getCart().reduce((sum, item) => sum + item.qty, 0);
  }

  function updateCounts() {
    document.querySelectorAll("[data-cart-count]").forEach((node) => {
      node.textContent = cartCount();
    });

    document.querySelectorAll("[data-wishlist-count]").forEach((node) => {
      node.textContent = getWishlist().length;
    });

    const loginLink = document.querySelector("[data-login-link]");
    const user = getCurrentUser();
    if (loginLink) {
      loginLink.href = user ? "account.html" : "login.html";
      loginLink.textContent = user ? "My Account" : "Login / Register";
    }
  }

  function addToCart(productId, qty, options) {
    const product = getProductById(productId);
    if (!product) return;

    const selection = options || {};
    const quantity = Number(qty) > 0 ? Number(qty) : 1;
    const cart = getCart();
    const color = selection.color || product.colors[0] || "Default";
    const strap = selection.strap || product.strapOptions[0] || "Standard";

    const existing = cart.find((item) => item.id === productId && item.color === color && item.strap === strap);

    if (existing) {
      existing.qty += quantity;
    } else {
      cart.push({
        id: productId,
        qty: quantity,
        color,
        strap
      });
    }

    setCart(cart);
    showToast(`${product.name} added to cart`);
  }

  function toggleWishlist(productId) {
    const items = getWishlist();
    const index = items.indexOf(productId);
    let active = false;

    if (index > -1) {
      items.splice(index, 1);
    } else {
      items.push(productId);
      active = true;
    }

    setWishlist(items, { skipRemote: true });
    syncWishlist(productId, active);
    syncWishlistButtons();
    return active;
  }

  async function syncWishlist(productId, enabled) {
    if (!hasAuthToken()) return;

    try {
      const response = enabled
        ? await apiRequest("/wishlist", { method: "POST", body: { productId } })
        : await apiRequest(`/wishlist/${encodeURIComponent(productId)}`, { method: "DELETE" });

      if (Array.isArray(response.ids)) {
        setWishlist(response.ids, { skipRemote: true });
        syncWishlistButtons();
      }
    } catch (error) {
      handleAuthError(error);
    }
  }

  function syncWishlistButtons() {
    const wish = new Set(getWishlist());
    document.querySelectorAll("[data-wishlist]").forEach((btn) => {
      const id = btn.getAttribute("data-wishlist");
      const on = wish.has(id);
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", String(on));
      btn.setAttribute("title", on ? "Remove from wishlist" : "Add to wishlist");
      btn.textContent = on ? "♥" : "♡";
    });
  }

  function removeFromCart(index) {
    const cart = getCart();
    cart.splice(index, 1);
    setCart(cart);
  }

  function clearCart() {
    setCart([]);
  }

  async function syncCartToServer(cartItems) {
    if (!hasAuthToken()) return;

    try {
      const response = await apiRequest("/cart", {
        method: "PUT",
        body: { items: normalizeCartItems(cartItems) }
      });

      const normalized = normalizeCartResponse(response);
      setCart(normalized, { skipRemote: true });
    } catch (error) {
      handleAuthError(error);
    }
  }

  function normalizeCartResponse(response) {
    const lineItems = Array.isArray(response.items) ? response.items : [];

    return lineItems
      .map((item) => ({
        id: String(item.id || item.product?.id || item.productId || "").trim(),
        qty: Math.max(1, Number(item.qty || 1)),
        color: String(item.color || "Default"),
        strap: String(item.strap || "Standard")
      }))
      .filter((item) => item.id && Number.isFinite(item.qty));
  }

  async function fetchCart() {
    if (!hasAuthToken()) return getCart();

    try {
      const response = await apiRequest("/cart");
      const normalized = normalizeCartResponse(response);
      setCart(normalized, { skipRemote: true });
      return normalized;
    } catch (error) {
      handleAuthError(error);
      return getCart();
    }
  }

  async function fetchWishlist() {
    if (!hasAuthToken()) return getWishlist();

    try {
      const response = await apiRequest("/wishlist");
      const ids = Array.isArray(response.ids) ? response.ids : [];
      setWishlist(ids, { skipRemote: true });
      syncWishlistButtons();
      return ids;
    } catch (error) {
      handleAuthError(error);
      return getWishlist();
    }
  }

  async function fetchOrders() {
    if (!hasAuthToken()) return getOrders();

    try {
      const response = await apiRequest("/orders");
      const orders = Array.isArray(response.orders) ? response.orders : [];
      setOrders(orders);
      return orders;
    } catch (error) {
      handleAuthError(error);
      return getOrders();
    }
  }

  function totalFromCart() {
    return getCart().reduce((sum, item) => {
      const product = getProductById(item.id);
      return product ? sum + product.price * item.qty : sum;
    }, 0);
  }

  async function apiLogin(payload) {
    const response = await apiRequest("/auth/login", {
      method: "POST",
      body: {
        email: String(payload.email || "").trim().toLowerCase(),
        password: String(payload.password || "")
      },
      auth: false
    });

    setAuthToken(response.token || "");
    setCurrentUser(response.user || null);
    await Promise.all([fetchCart(), fetchWishlist(), fetchOrders()]);
    updateCounts();

    return response.user;
  }

  async function apiRegister(payload) {
    const response = await apiRequest("/auth/register", {
      method: "POST",
      body: {
        name: String(payload.name || "").trim(),
        email: String(payload.email || "").trim().toLowerCase(),
        phone: String(payload.phone || "").trim(),
        password: String(payload.password || "")
      },
      auth: false
    });

    setAuthToken(response.token || "");
    setCurrentUser(response.user || null);
    await Promise.all([fetchCart(), fetchWishlist(), fetchOrders()]);
    updateCounts();

    return response.user;
  }

  async function apiLogout() {
    if (hasAuthToken()) {
      try {
        await apiRequest("/auth/logout", { method: "POST" });
      } catch (_error) {
        // Ignore API logout errors and clear local session anyway.
      }
    }

    clearAuthSession();
    updateCounts();
  }

  async function apiUpdateProfile(payload) {
    const response = await apiRequest("/account/profile", {
      method: "PUT",
      body: {
        name: String(payload.name || "").trim(),
        email: String(payload.email || "").trim().toLowerCase(),
        phone: String(payload.phone || "").trim(),
        address: String(payload.address || "").trim()
      }
    });

    setCurrentUser(response.user || null);
    return response.user;
  }

  async function placeOrder(payload) {
    const cartItems = getCart();
    if (!cartItems.length) {
      throw new Error("No items in cart.");
    }

    if (hasAuthToken()) {
      const response = await apiRequest("/orders", {
        method: "POST",
        body: {
          ...payload,
          items: cartItems
        }
      });

      if (response.order) {
        const nextOrders = [response.order, ...getOrders().filter((order) => order.id !== response.order.id)];
        setOrders(nextOrders);
      }

      setCart([], { skipRemote: true });
      return response.order;
    }

    // Guest checkout fallback for demo mode.
    const subtotal = totalFromCart();
    const shippingCharge = Number(payload?.shippingCharge);
    const shipping = Number.isFinite(shippingCharge) && shippingCharge >= 0 ? shippingCharge : 99;

    const localOrder = {
      id: `BH49-${Date.now().toString().slice(-8)}`,
      date: new Date().toISOString(),
      status: "Processing",
      total: subtotal + shipping,
      items: cartItems
    };

    const orders = getOrders();
    orders.unshift(localOrder);
    setOrders(orders);
    setCart([], { skipRemote: true });

    return localOrder;
  }

  async function bootstrapSession() {
    if (sessionBootstrapPromise) {
      return sessionBootstrapPromise;
    }

    sessionBootstrapPromise = (async () => {
      if (!hasAuthToken()) {
        updateCounts();
        return null;
      }

      try {
        const response = await apiRequest("/auth/me");
        setCurrentUser(response.user || null);
        await Promise.all([fetchCart(), fetchWishlist(), fetchOrders()]);
        updateCounts();
        return response.user || null;
      } catch (error) {
        handleAuthError(error);
        updateCounts();
        return null;
      }
    })();

    try {
      return await sessionBootstrapPromise;
    } finally {
      sessionBootstrapPromise = null;
    }
  }

  function createProductCard(product, config) {
    const settings = {
      quickActions: true,
      ...config
    };

    const dPct = discountPercent(product);
    const badges = (product.badges || []).slice(0, 2);
    const wishlist = getWishlist().includes(product.id);

    return `
      <article class="product-card" aria-label="${product.name}">
        <div class="product-media">
          <a href="product.html?id=${product.id}" aria-label="View ${product.name}">
            <img loading="lazy" src="${product.image}" alt="${product.name}" />
          </a>
          <div class="badge-row">
            ${badges
              .map(
                (badge, index) =>
                  `<span class="badge ${index === 0 ? "gold" : ""}">${badge}</span>`
              )
              .join("")}
          </div>
          <button class="wishlist-btn ${wishlist ? "active" : ""}" data-wishlist="${product.id}" aria-label="Toggle wishlist for ${product.name}" aria-pressed="${wishlist}">${wishlist ? "♥" : "♡"}</button>
          ${
            settings.quickActions
              ? `<div class="quick-actions">
            <button class="btn" data-add-cart="${product.id}">Add to Cart</button>
            <a class="btn btn-outline" href="product.html?id=${product.id}">View</a>
          </div>`
              : ""
          }
        </div>
        <div class="product-body">
          <div class="product-brand">${product.brand}</div>
          <a class="product-name" href="product.html?id=${product.id}">${product.name}</a>
          <div class="price-row">
            <span class="price">${formatPrice(product.price)}</span>
            <span class="compare-at">${formatPrice(product.compareAt)}</span>
            ${dPct ? `<span class="discount">Save ${dPct}%</span>` : ""}
          </div>
          <div class="rating"><span class="stars">${starsMarkup(product.rating)}</span> ${product.rating} (${product.reviews})</div>
        </div>
      </article>
    `;
  }

  function createPostCard(post) {
    return `
      <article class="post-card">
        <a href="blog-post.html?id=${post.id}" aria-label="Read ${post.title}">
          <img loading="lazy" src="${post.image}" alt="${post.title}" />
        </a>
        <div class="post-body">
          <div class="post-meta">${new Date(post.date).toLocaleDateString("en-IN", {
            year: "numeric",
            month: "short",
            day: "numeric"
          })} | ${post.author}</div>
          <h3><a href="blog-post.html?id=${post.id}">${post.title}</a></h3>
          <p>${post.excerpt}</p>
          <a class="btn btn-outline" href="blog-post.html?id=${post.id}">Read Article</a>
        </div>
      </article>
    `;
  }

  function renderHeader() {
    const root = document.getElementById("site-header");
    if (!root) return;

    root.innerHTML = `
      <div class="top-utility" role="region" aria-label="Utility Navigation">
        <div class="container top-utility-inner">
          <div class="utility-links">
            <a href="track-order.html">Track Order</a>
            <a href="contact.html">Support</a>
            <a href="login.html" data-login-link>Login / Register</a>
            <a href="wishlist.html">Wishlist (<span data-wishlist-count>0</span>)</a>
            <a href="cart.html">Cart (<span data-cart-count>0</span>)</a>
          </div>
          <div class="right-side">COD Available | Shipping charges ₹99 extra in advance</div>
        </div>
      </div>
      <header class="site-header" id="sticky-header" role="banner">
        <div class="container nav-inner">
          <button class="icon-btn mobile-menu-toggle" aria-label="Toggle menu" id="mobile-menu-toggle">☰</button>
          <a class="logo" href="index.html" aria-label="BrandsHub49 home">Brands<span>Hub49</span></a>
          <nav aria-label="Main Navigation">
            <ul class="nav-menu" id="main-nav-menu">
              <li class="nav-item"><a class="nav-link" href="index.html">Home</a></li>
              <li class="nav-item"><a class="nav-link" href="shop.html">Shop All Watches</a></li>
              <li class="nav-item">
                <a class="nav-link" href="shop.html">Collections</a>
                <div class="dropdown" role="menu" aria-label="Watch collections">
                  <a href="shop.html?gender=Men">Men's Watches</a>
                  <a href="shop.html?gender=Women">Women's Watches</a>
                  <a href="shop.html?collection=Premium%20Watches">Premium Watches</a>
                  <a href="shop.html?collection=Smartwatches">Smartwatches</a>
                  <a href="shop.html?type=Digital">Digital Watches</a>
                </div>
              </li>
              <li class="nav-item"><a class="nav-link" href="about.html">About Us</a></li>
              <li class="nav-item"><a class="nav-link" href="blog.html">Blog</a></li>
              <li class="nav-item"><a class="nav-link" href="contact.html">Contact</a></li>
            </ul>
          </nav>
          <div class="nav-tools">
            <form class="search-wrap" role="search" id="global-search-form" autocomplete="off">
              <label class="sr-only" for="global-search">Search watches</label>
              <input id="global-search" name="q" class="input" type="search" placeholder="Search watches, brands..." aria-autocomplete="list" aria-expanded="false" />
              <span class="search-icon">⌕</span>
              <div id="suggest-list" class="suggest-list" role="listbox" aria-label="Search suggestions"></div>
            </form>
            <a class="icon-btn" href="wishlist.html" aria-label="Wishlist">♡<span data-wishlist-count class="count-pill">0</span></a>
            <a class="icon-btn" href="cart.html" aria-label="Cart">🛒<span data-cart-count class="count-pill">0</span></a>
          </div>
        </div>
      </header>
    `;

    const bodyPage = document.body.getAttribute("data-page");
    const links = root.querySelectorAll(".nav-link");
    links.forEach((link) => {
      const href = link.getAttribute("href");
      const active =
        (bodyPage === "home" && href === "index.html") ||
        (bodyPage === "shop" && href === "shop.html") ||
        (bodyPage === "about" && href === "about.html") ||
        (bodyPage === "blog" && href === "blog.html") ||
        (bodyPage === "contact" && href === "contact.html");
      if (active) {
        link.style.color = "var(--gold-deep)";
      }
    });

    const sticky = document.getElementById("sticky-header");
    const toggle = document.getElementById("mobile-menu-toggle");
    const menu = document.getElementById("main-nav-menu");

    if (toggle && menu) {
      toggle.addEventListener("click", () => {
        menu.classList.toggle("show");
      });
    }

    window.addEventListener("scroll", () => {
      if (!sticky) return;
      sticky.classList.toggle("is-sticky", window.scrollY > 8);
    });

    setupSearch();
    updateCounts();
  }

  function setupSearch() {
    const form = document.getElementById("global-search-form");
    const input = document.getElementById("global-search");
    const list = document.getElementById("suggest-list");
    if (!form || !input || !list) return;

    const close = () => {
      list.classList.remove("show");
      input.setAttribute("aria-expanded", "false");
    };

    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      if (!q || q.length < 1) {
        close();
        return;
      }

      const suggestions = data.products
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.brand.toLowerCase().includes(q) ||
            p.collection.toLowerCase().includes(q)
        )
        .slice(0, 6);

      if (!suggestions.length) {
        list.innerHTML = `<div class="suggest-item"><span>No results found</span></div>`;
      } else {
        list.innerHTML = suggestions
          .map(
            (item) =>
              `<div class="suggest-item" role="option" tabindex="0" data-suggest-id="${item.id}"><span>${item.name}</span><small>${item.brand}</small></div>`
          )
          .join("");
      }

      list.classList.add("show");
      input.setAttribute("aria-expanded", "true");
    });

    list.addEventListener("click", (event) => {
      const row = event.target.closest("[data-suggest-id]");
      if (!row) return;
      const id = row.getAttribute("data-suggest-id");
      window.location.href = `product.html?id=${id}`;
    });

    list.addEventListener("keydown", (event) => {
      const row = event.target.closest("[data-suggest-id]");
      if (!row) return;
      if (event.key === "Enter") {
        const id = row.getAttribute("data-suggest-id");
        window.location.href = `product.html?id=${id}`;
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      window.location.href = `shop.html?q=${encodeURIComponent(q)}`;
    });

    document.addEventListener("click", (event) => {
      if (!form.contains(event.target)) {
        close();
      }
    });
  }

  function renderFooter() {
    const root = document.getElementById("site-footer");
    if (!root) return;

    root.innerHTML = `
      <section class="newsletter-band" aria-label="Newsletter signup">
        <div class="container newsletter-row">
          <h3>Join the Brands Hub49 Community</h3>
          <form class="newsletter-form" id="newsletter-form">
            <label class="sr-only" for="newsletter-email">Email Address</label>
            <input id="newsletter-email" type="email" placeholder="Enter your email for new watch arrivals" required />
            <button class="btn btn-gold" type="submit">Subscribe</button>
          </form>
        </div>
      </section>
      <footer class="site-footer" role="contentinfo">
        <div class="container footer-main">
          <div>
            <a class="logo" href="index.html" aria-label="BrandsHub49">Brands<span>Hub49</span></a>
            <p>Trusted watch store in Nagpur with COD support, fast dispatch, and premium styles at affordable prices.</p>
          </div>
          <div>
            <h4>Quick Links</h4>
            <div class="footer-links">
              <a href="shop.html">Shop All</a>
              <a href="about.html">About Us</a>
              <a href="track-order.html">Track Order</a>
              <a href="shipping.html">Shipping Info</a>
              <a href="returns.html">Returns</a>
            </div>
          </div>
          <div>
            <h4>Collections</h4>
            <div class="footer-links">
              <a href="shop.html?gender=Men">Men's Watches</a>
              <a href="shop.html?gender=Women">Women's Watches</a>
              <a href="shop.html?collection=Premium%20Watches">Premium Watches</a>
              <a href="shop.html?collection=Smartwatches">Smartwatches</a>
            </div>
          </div>
          <div>
            <h4>Connect</h4>
            <div class="social-row">
              <a href="https://www.instagram.com/brands_hub49/" target="_blank" rel="noopener" aria-label="Instagram">I</a>
              <a href="#" aria-label="Facebook">F</a>
              <a href="#" aria-label="Twitter">X</a>
              <a href="#" aria-label="YouTube">Y</a>
            </div>
            <p style="margin-top: 10px;">Instagram: @brands_hub49<br/>Call/WhatsApp: 7378847069<br/>Barakholi Sq, beside Anil Traders, Nagpur 440014</p>
          </div>
        </div>
        <div class="container footer-bottom">
          <span>Copyright © 2026 BrandsHub49. All rights reserved.</span>
          <span><a href="#">Terms</a> | <a href="#">Privacy</a></span>
        </div>
      </footer>
    `;

    const form = document.getElementById("newsletter-form");
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        showToast("Thanks for subscribing.");
        form.reset();
      });
    }
  }

  function showToast(message) {
    let toast = document.querySelector(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove("show"), 1800);
  }

  function setupGlobalEvents() {
    document.addEventListener("click", (event) => {
      const addBtn = event.target.closest("[data-add-cart]");
      if (addBtn) {
        const productId = addBtn.getAttribute("data-add-cart");
        addToCart(productId, 1, {});
      }

      const wishBtn = event.target.closest("[data-wishlist]");
      if (wishBtn) {
        const productId = wishBtn.getAttribute("data-wishlist");
        const enabled = toggleWishlist(productId);
        showToast(enabled ? "Added to wishlist" : "Removed from wishlist");
      }
    });
  }

  function requireAuth(redirectPage) {
    const redirect = redirectPage || "account.html";
    const user = getCurrentUser();

    if (!hasAuthToken() || !user) {
      window.location.href = `login.html?redirect=${encodeURIComponent(redirect)}`;
      return false;
    }

    return true;
  }

  function buildProductJsonLd(product) {
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      image: product.images,
      brand: {
        "@type": "Brand",
        name: product.brand
      },
      sku: product.sku,
      description: product.description,
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: product.rating,
        reviewCount: product.reviews
      },
      offers: {
        "@type": "Offer",
        priceCurrency: data.currency || "INR",
        price: product.price,
        availability:
          product.availability === "In Stock"
            ? "https://schema.org/InStock"
            : "https://schema.org/LimitedAvailability"
      }
    };
  }

  window.LWC = {
    data,
    storage: STORAGE_KEYS,
    formatPrice,
    getCart,
    setCart,
    clearCart,
    fetchCart,
    getWishlist,
    setWishlist,
    fetchWishlist,
    getProductById,
    getCurrentUser,
    setCurrentUser,
    getUsers,
    setUsers,
    getOrders,
    setOrders,
    fetchOrders,
    addToCart,
    removeFromCart,
    toggleWishlist,
    totalFromCart,
    discountPercent,
    starsMarkup,
    createProductCard,
    createPostCard,
    showToast,
    requireAuth,
    buildProductJsonLd,
    updateCounts,
    syncWishlistButtons,
    getAuthToken,
    setAuthToken,
    bootstrapSession,
    apiLogin,
    apiRegister,
    apiLogout,
    apiUpdateProfile,
    placeOrder
  };

  renderHeader();
  renderFooter();
  setupGlobalEvents();
  syncWishlistButtons();
  void bootstrapSession();
})();
