document.addEventListener("DOMContentLoaded", () => {
  setupAccountDashboard();
  setupWishlistPage();
});

async function setupAccountDashboard() {
  const root = document.getElementById("account-root");
  if (!root) return;

  await window.LWC.bootstrapSession();
  if (!window.LWC.requireAuth("account.html")) return;

  const tabs = Array.from(document.querySelectorAll("[data-account-tab]"));
  const panels = Array.from(document.querySelectorAll("[data-account-panel]"));

  const profileForm = document.getElementById("profile-form");
  const addressForm = document.getElementById("address-form");
  const orderList = document.getElementById("order-history");
  const wishList = document.getElementById("account-wishlist");

  hydrateUserFields();

  tabs.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.getAttribute("data-account-tab");
      tabs.forEach((node) => node.classList.remove("active"));
      panels.forEach((panel) => panel.classList.add("hidden"));
      button.classList.add("active");
      document.querySelector(`[data-account-panel="${target}"]`)?.classList.remove("hidden");
    });
  });

  profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      name: document.getElementById("profile-name").value.trim(),
      email: document.getElementById("profile-email").value.trim().toLowerCase(),
      phone: document.getElementById("profile-phone").value.trim(),
      address: (window.LWC.getCurrentUser() || {}).address || ""
    };

    if (!payload.name || !payload.email) {
      window.LWC.showToast("Name and email are required.");
      return;
    }

    try {
      await window.LWC.apiUpdateProfile(payload);
      window.LWC.showToast("Profile updated.");
      hydrateUserFields();
    } catch (error) {
      window.LWC.showToast(error.message || "Unable to update profile.");
    }
  });

  addressForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const currentUser = window.LWC.getCurrentUser() || {};
    const payload = {
      name: currentUser.name || "",
      email: currentUser.email || "",
      phone: currentUser.phone || "",
      address: document.getElementById("address-text").value.trim()
    };

    try {
      await window.LWC.apiUpdateProfile(payload);
      window.LWC.showToast("Address book updated.");
      hydrateUserFields();
    } catch (error) {
      window.LWC.showToast(error.message || "Unable to update address.");
    }
  });

  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await window.LWC.apiLogout();
    window.location.href = "login.html";
  });

  await Promise.all([window.LWC.fetchOrders(), window.LWC.fetchWishlist()]);
  renderOrders(orderList);
  renderWishlist(wishList);
}

function hydrateUserFields() {
  const user = window.LWC.getCurrentUser() || {};

  const name = document.getElementById("profile-name");
  const email = document.getElementById("profile-email");
  const phone = document.getElementById("profile-phone");
  const address = document.getElementById("address-text");

  if (name) name.value = user.name || "";
  if (email) email.value = user.email || "";
  if (phone) phone.value = user.phone || "";
  if (address) address.value = user.address || "";
}

function renderOrders(root) {
  if (!root) return;
  const orders = window.LWC.getOrders();

  if (!orders.length) {
    root.innerHTML = `<div class="empty-state">No orders yet. Start with our latest arrivals.</div>`;
    return;
  }

  root.innerHTML = orders
    .map((order) => {
      const dateRaw = order.createdAt || order.date;
      return `
      <div class="sidebar-card">
        <strong>Order ${order.id}</strong>
        <p style="margin: 6px 0; color: #666;">${new Date(dateRaw).toLocaleDateString("en-IN", {
          year: "numeric",
          month: "short",
          day: "numeric"
        })} | ${order.status || "Processing"}</p>
        <p style="margin: 0;"><strong>Total:</strong> ${window.LWC.formatPrice(order.total || 0)}</p>
      </div>
      `;
    })
    .join("");
}

function renderWishlist(root) {
  if (!root) return;
  const ids = window.LWC.getWishlist();
  const products = ids
    .map((id) => window.LWC.getProductById(id))
    .filter(Boolean)
    .slice(0, 4);

  if (!products.length) {
    root.innerHTML = `<div class="empty-state">No wishlist items yet.</div>`;
    return;
  }

  root.innerHTML = products
    .map(
      (product) => `
      <div class="order-line">
        <span>${product.name}</span>
        <a class="btn btn-outline" href="product.html?id=${product.id}" style="padding: 6px 10px;">View</a>
      </div>
    `
    )
    .join("");
}

async function setupWishlistPage() {
  const root = document.getElementById("wishlist-root");
  if (!root) return;

  await window.LWC.bootstrapSession();
  if (window.LWC.getAuthToken()) {
    await window.LWC.fetchWishlist();
  }

  const ids = window.LWC.getWishlist();
  const items = ids.map((id) => window.LWC.getProductById(id)).filter(Boolean);

  if (!items.length) {
    root.innerHTML = `<div class="empty-state">Your wishlist is empty. Save watches to revisit them anytime.</div>`;
    return;
  }

  root.innerHTML = `<div class="product-grid">${items
    .map((item) => window.LWC.createProductCard(item, {}))
    .join("")}</div>`;
  window.LWC.syncWishlistButtons();
}
