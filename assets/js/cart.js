document.addEventListener("DOMContentLoaded", () => {
  setupCartPage();
});

async function setupCartPage() {
  const container = document.getElementById("cart-items");
  if (!container) return;

  await window.LWC.bootstrapSession();
  if (window.LWC.getAuthToken()) {
    await window.LWC.fetchCart();
  }

  const refs = {
    container,
    subtotal: document.getElementById("cart-subtotal"),
    discount: document.getElementById("cart-discount"),
    shipping: document.getElementById("cart-shipping"),
    total: document.getElementById("cart-total"),
    couponInput: document.getElementById("coupon-code"),
    applyCoupon: document.getElementById("apply-coupon"),
    shippingRegion: document.getElementById("shipping-region"),
    shippingButton: document.getElementById("calc-shipping"),
    checkoutButton: document.getElementById("go-checkout")
  };

  const state = {
    discountRate: 0,
    shipping: 99
  };

  refs.applyCoupon?.addEventListener("click", () => {
    const code = refs.couponInput?.value.trim().toUpperCase();
    if (!code) return;

    if (code === "WATCH10") {
      state.discountRate = 0.1;
      window.LWC.showToast("Coupon WATCH10 applied.");
    } else if (code === "LUXE15") {
      state.discountRate = 0.15;
      window.LWC.showToast("Coupon LUXE15 applied.");
    } else {
      state.discountRate = 0;
      window.LWC.showToast("Invalid coupon code.");
    }

    render();
  });

  refs.shippingButton?.addEventListener("click", () => {
    const region = refs.shippingRegion?.value || "india";
    if (region === "india") {
      state.shipping = 99;
    } else if (region === "asia") {
      state.shipping = 199;
    } else {
      state.shipping = 399;
    }
    render();
  });

  refs.checkoutButton?.addEventListener("click", () => {
    if (!window.LWC.getCart().length) {
      window.LWC.showToast("Your cart is empty.");
      return;
    }
    window.location.href = "checkout.html";
  });

  refs.container.addEventListener("click", (event) => {
    const qtyBtn = event.target.closest("[data-qty-action]");
    if (qtyBtn) {
      const index = Number(qtyBtn.getAttribute("data-index"));
      const action = qtyBtn.getAttribute("data-qty-action");
      const cart = window.LWC.getCart();
      const item = cart[index];
      if (!item) return;

      if (action === "plus") item.qty += 1;
      if (action === "minus") item.qty = Math.max(1, item.qty - 1);

      window.LWC.setCart(cart);
      render();
      return;
    }

    const remove = event.target.closest("[data-remove-item]");
    if (remove) {
      const index = Number(remove.getAttribute("data-remove-item"));
      window.LWC.removeFromCart(index);
      render();
    }
  });

  refs.container.addEventListener("change", (event) => {
    const qtyInput = event.target.closest("[data-qty-input]");
    if (!qtyInput) return;

    const index = Number(qtyInput.getAttribute("data-qty-input"));
    const value = Math.max(1, Number(qtyInput.value || 1));
    const cart = window.LWC.getCart();
    if (!cart[index]) return;

    cart[index].qty = value;
    window.LWC.setCart(cart);
    render();
  });

  function render() {
    const cart = window.LWC.getCart();

    if (!cart.length) {
      refs.container.innerHTML = `<div class="empty-state">Your cart is currently empty. Explore our premium collections to get started.</div>`;
      updateTotals(0);
      return;
    }

    refs.container.innerHTML = cart
      .map((item, index) => {
        const product = window.LWC.getProductById(item.id);
        if (!product) return "";

        return `
          <div class="cart-row">
            <div class="cart-item">
              <img src="${product.image}" alt="${product.name}" loading="lazy" />
              <div>
                <strong>${product.name}</strong>
                <div style="font-size: .87rem; color: #666;">Color: ${item.color || product.colors[0]} | Strap: ${
          item.strap || product.strapOptions[0]
        }</div>
                <button class="btn btn-outline" style="margin-top: 8px; padding: 6px 10px;" data-remove-item="${index}">Remove</button>
              </div>
            </div>
            <div>
              <span>Price</span>
              <strong>${window.LWC.formatPrice(product.price)}</strong>
            </div>
            <div>
              <span>Qty</span>
              <div class="qty-wrap">
                <button type="button" data-qty-action="minus" data-index="${index}">-</button>
                <input type="number" min="1" value="${item.qty}" data-qty-input="${index}" aria-label="Quantity for ${
          product.name
        }" />
                <button type="button" data-qty-action="plus" data-index="${index}">+</button>
              </div>
            </div>
            <div>
              <span>Subtotal</span>
              <strong>${window.LWC.formatPrice(product.price * item.qty)}</strong>
            </div>
          </div>
        `;
      })
      .join("");

    const subtotal = window.LWC.totalFromCart();
    updateTotals(subtotal);
  }

  function updateTotals(subtotal) {
    const discount = Math.round(subtotal * state.discountRate);
    const shippingCharge = subtotal > 0 ? state.shipping : 0;
    const grand = Math.max(0, subtotal - discount + shippingCharge);

    refs.subtotal.textContent = window.LWC.formatPrice(subtotal);
    refs.discount.textContent = `-${window.LWC.formatPrice(discount)}`;
    refs.shipping.textContent = window.LWC.formatPrice(shippingCharge);
    refs.total.textContent = window.LWC.formatPrice(grand);
  }

  render();
}
