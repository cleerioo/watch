document.addEventListener("DOMContentLoaded", () => {
  setupCheckout();
});

async function setupCheckout() {
  const root = document.getElementById("checkout-root");
  if (!root) return;

  await window.LWC.bootstrapSession();
  if (window.LWC.getAuthToken()) {
    await window.LWC.fetchCart();
  }

  if (!window.LWC.getCart().length) {
    window.location.href = "cart.html";
    return;
  }

  const state = {
    step: 0
  };

  const sections = Array.from(document.querySelectorAll("[data-checkout-step]"));
  const steps = Array.from(document.querySelectorAll(".checkout-steps .step"));
  const summary = document.getElementById("checkout-summary");
  const totalNode = document.getElementById("checkout-total");

  function cartItems() {
    return window.LWC.getCart()
      .map((item) => {
        const product = window.LWC.getProductById(item.id);
        return product ? { ...item, product } : null;
      })
      .filter(Boolean);
  }

  function subtotal() {
    return cartItems().reduce((sum, item) => sum + item.product.price * item.qty, 0);
  }

  function selectedDelivery() {
    const checked = document.querySelector('input[name="delivery"]:checked');
    if (!checked) return { label: "Standard Delivery", charge: 99 };

    const label = checked.closest("label")?.textContent?.trim() || "Standard Delivery";
    return {
      label,
      charge: parseChargeFromLabel(label)
    };
  }

  function selectedPayment() {
    const checked = document.querySelector('input[name="payment"]:checked');
    const label = checked?.closest("label")?.textContent?.trim();
    return label || "Credit / Debit Card";
  }

  function parseChargeFromLabel(label) {
    const free = /free/i.test(label);
    if (free) return 0;

    const match = label.match(/₹\s*(\d+)/i);
    if (match) return Number(match[1]);

    return 99;
  }

  function renderSummary() {
    const items = cartItems();
    const sub = subtotal();
    const delivery = selectedDelivery();
    const total = sub + delivery.charge;

    summary.innerHTML = items
      .map(
        (item) => `
        <div class="order-line">
          <span>${item.product.name} x ${item.qty}</span>
          <strong>${window.LWC.formatPrice(item.product.price * item.qty)}</strong>
        </div>
      `
      )
      .join("");

    summary.innerHTML += `
      <div class="order-line"><span>Subtotal</span><strong>${window.LWC.formatPrice(sub)}</strong></div>
      <div class="order-line"><span>Shipping</span><strong>${window.LWC.formatPrice(delivery.charge)}</strong></div>
    `;

    totalNode.textContent = window.LWC.formatPrice(total);
  }

  function showStep(index) {
    state.step = Math.max(0, Math.min(index, sections.length - 1));
    sections.forEach((section, idx) => {
      section.classList.toggle("hidden", idx !== state.step);
    });
    steps.forEach((step, idx) => {
      step.classList.toggle("active", idx <= state.step);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.querySelectorAll("[data-next-step]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!validateStep(state.step, sections)) return;
      showStep(state.step + 1);
    });
  });

  document.querySelectorAll("[data-prev-step]").forEach((button) => {
    button.addEventListener("click", () => {
      showStep(state.step - 1);
    });
  });

  document.querySelectorAll('input[name="delivery"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      renderSummary();
    });
  });

  document.getElementById("place-order")?.addEventListener("click", async (event) => {
    if (!validateStep(state.step, sections)) return;

    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Placing...";

    try {
      const payload = buildOrderPayload(sections);
      const order = await window.LWC.placeOrder(payload);

      window.LWC.showToast(`Order ${order.id} placed successfully.`);
      setTimeout(() => {
        window.location.href = window.LWC.getAuthToken() ? "account.html" : "track-order.html";
      }, 1000);
    } catch (error) {
      window.LWC.showToast(error.message || "Unable to place order. Please try again.");
    } finally {
      button.disabled = false;
      button.textContent = "Place Order";
    }
  });

  renderSummary();
  showStep(0);
}

function validateStep(stepIndex, sections) {
  const section = sections[stepIndex];
  if (!section) return true;

  const required = section.querySelectorAll("[required]");
  for (const field of required) {
    if (field.type === "radio") {
      const name = field.getAttribute("name");
      if (name && !section.querySelector(`input[name="${name}"]:checked`)) {
        window.LWC.showToast("Please complete required fields before continuing.");
        return false;
      }
      continue;
    }

    if (!field.value) {
      field.focus();
      window.LWC.showToast("Please fill all required fields before continuing.");
      return false;
    }
  }

  return true;
}

function buildOrderPayload(sections) {
  const shippingFields = sections[0].querySelectorAll("input, select");
  const billingFields = sections[1].querySelectorAll("input");

  const shippingInfo = {
    firstName: shippingFields[0]?.value?.trim() || "",
    lastName: shippingFields[1]?.value?.trim() || "",
    email: shippingFields[2]?.value?.trim() || "",
    phone: shippingFields[3]?.value?.trim() || "",
    addressLine: shippingFields[4]?.value?.trim() || "",
    city: shippingFields[5]?.value?.trim() || "",
    postalCode: shippingFields[6]?.value?.trim() || "",
    country: shippingFields[7]?.value?.trim() || ""
  };

  const billingInfo = {
    addressLine: billingFields[0]?.value?.trim() || "",
    city: billingFields[1]?.value?.trim() || "",
    postalCode: billingFields[2]?.value?.trim() || "",
    sameAsShipping: Boolean(billingFields[3]?.checked)
  };

  const deliveryLabel =
    document.querySelector('input[name="delivery"]:checked')?.closest("label")?.textContent?.trim() ||
    "Standard Delivery";

  const paymentMethod =
    document.querySelector('input[name="payment"]:checked')?.closest("label")?.textContent?.trim() ||
    "Credit / Debit Card";

  return {
    shippingInfo,
    billingInfo,
    deliveryOption: deliveryLabel,
    paymentMethod,
    shippingCharge: parseDeliveryCharge(deliveryLabel)
  };
}

function parseDeliveryCharge(label) {
  if (/free/i.test(label)) return 0;
  const match = label.match(/₹\s*(\d+)/i);
  if (match) return Number(match[1]);
  return 99;
}
