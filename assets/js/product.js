document.addEventListener("DOMContentLoaded", () => {
  const { data } = window.LWC;
  const params = new URLSearchParams(window.location.search);
  const productId = params.get("id") || data.products[0]?.id;
  const product = window.LWC.getProductById(productId) || data.products[0];
  if (!product) return;

  renderProduct(product);
  renderRelated(product);
  initTabs();
  initStickyBar(product);
  injectStructuredData(product);
});

function renderProduct(product) {
  document.title = `${product.name} | BrandsHub49`;

  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    metaDesc.setAttribute("content", `${product.description} Buy now with secure checkout and global shipping.`);
  }

  const breadcrumb = document.getElementById("pdp-breadcrumb");
  const mainImg = document.getElementById("pdp-main-image");
  const thumbs = document.getElementById("pdp-thumbs");
  const details = document.getElementById("pdp-details");
  const stickyName = document.getElementById("sticky-product-name");
  const stickyPrice = document.getElementById("sticky-product-price");

  if (breadcrumb) {
    breadcrumb.innerHTML = `
      <a href="index.html">Home</a> / 
      <a href="shop.html">Shop All Watches</a> / 
      <a href="shop.html?collection=${encodeURIComponent(product.collection)}">${product.collection}</a> /
      <span>${product.name}</span>
    `;
  }

  if (mainImg) {
    mainImg.src = product.images[0] || product.image;
    mainImg.alt = product.name;
  }

  if (stickyName) stickyName.textContent = product.name;
  if (stickyPrice) stickyPrice.textContent = window.LWC.formatPrice(product.price);

  if (thumbs) {
    thumbs.innerHTML = product.images
      .map(
        (img, index) =>
          `<button class="thumb-btn ${index === 0 ? "active" : ""}" data-thumb="${img}" aria-label="Show image ${
            index + 1
          }">
              <img loading="lazy" src="${img}" alt="${product.name} view ${index + 1}" />
            </button>`
      )
      .join("");

    thumbs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-thumb]");
      if (!button || !mainImg) return;
      mainImg.src = button.getAttribute("data-thumb");
      thumbs.querySelectorAll(".thumb-btn").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
    });
  }

  const discount = window.LWC.discountPercent(product);
  const savings = product.compareAt - product.price;

  if (details) {
    details.innerHTML = `
      <div class="product-brand">${product.brand}</div>
      <h1>${product.name}</h1>
      <div class="meta-line">
        <span class="rating"><span class="stars">${window.LWC.starsMarkup(product.rating)}</span> ${product.rating} (${product.reviews} reviews)</span>
        <span>SKU: ${product.sku}</span>
        <span>${product.availability}</span>
      </div>
      <div class="key-badges">
        ${(product.badges || []).map((badge) => `<span class="badge gold">${badge}</span>`).join("")}
      </div>
      <div class="price-block">
        <p class="price-large">${window.LWC.formatPrice(product.price)} <span class="compare-at">${window.LWC.formatPrice(
      product.compareAt
    )}</span></p>
        <p class="savings">You save ${window.LWC.formatPrice(savings)} (${discount}% OFF)</p>
        <p class="installments">EMI from ${window.LWC.formatPrice(Math.round(product.price / 6))}/month (6 months)</p>
      </div>

      <div class="option-group">
        <div class="option-label">Color</div>
        <div class="swatches" id="pdp-colors">
          ${product.colors
            .map(
              (color, index) =>
                `<button class="swatch ${index === 0 ? "active" : ""}" data-color="${color}" aria-pressed="${
                  index === 0
                }">${color}</button>`
            )
            .join("")}
        </div>
      </div>

      <div class="option-group">
        <div class="option-label">Strap</div>
        <div class="pills" id="pdp-straps">
          ${product.strapOptions
            .map(
              (strap, index) =>
                `<button class="pill ${index === 0 ? "active" : ""}" data-strap="${strap}" aria-pressed="${
                  index === 0
                }">${strap}</button>`
            )
            .join("")}
        </div>
      </div>
      <p class="installments"><strong>Case Size Hint:</strong> ${fitHint(product.caseSize)}</p>

      <div class="option-group">
        <div class="option-label">Quantity</div>
        <div class="qty-wrap" aria-label="Quantity selector">
          <button type="button" id="qty-minus" aria-label="Decrease quantity">-</button>
          <input id="qty-input" type="number" min="1" value="1" aria-label="Quantity" />
          <button type="button" id="qty-plus" aria-label="Increase quantity">+</button>
        </div>
      </div>

      <div class="buy-actions" id="buy-actions">
        <button class="btn btn-gold" id="pdp-add-to-cart">Add to Cart</button>
        <button class="btn btn-outline" id="pdp-buy-now">Buy Now</button>
      </div>

      <div class="share-row">
        <span>Share:</span>
        <a class="share-link" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
          window.location.href
        )}" aria-label="Share on Facebook">f</a>
        <a class="share-link" target="_blank" rel="noopener" href="https://www.instagram.com" aria-label="Share on Instagram">i</a>
        <a class="share-link" target="_blank" rel="noopener" href="https://api.whatsapp.com/send?text=${encodeURIComponent(
          `Check out this watch: ${window.location.href}`
        )}" aria-label="Share on WhatsApp">w</a>
        <a class="share-link" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?url=${encodeURIComponent(
          window.location.href
        )}" aria-label="Share on Twitter">x</a>
      </div>

      <div class="spec-grid">
        <div class="spec-item"><strong>Movement:</strong> ${product.movement}</div>
        <div class="spec-item"><strong>Case Size:</strong> ${product.caseSize}</div>
        <div class="spec-item"><strong>Water Resistance:</strong> ${product.waterResistance}</div>
        <div class="spec-item"><strong>Strap Type:</strong> ${product.strapType}</div>
        <div class="spec-item"><strong>Warranty:</strong> ${product.warranty}</div>
        <div class="spec-item"><strong>Category:</strong> ${product.type}</div>
      </div>
    `;
  }

  setupOptionSelectors();
  setupQuantity();
  setupAddActions(product);
  setupLightbox();
  renderTabs(product);
}

function setupOptionSelectors() {
  ["pdp-colors", "pdp-straps"].forEach((id) => {
    const root = document.getElementById(id);
    if (!root) return;

    root.addEventListener("click", (event) => {
      const btn = event.target.closest("button");
      if (!btn) return;
      root.querySelectorAll("button").forEach((node) => {
        node.classList.remove("active");
        node.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
    });
  });
}

function setupQuantity() {
  const input = document.getElementById("qty-input");
  const plus = document.getElementById("qty-plus");
  const minus = document.getElementById("qty-minus");
  if (!input || !plus || !minus) return;

  plus.addEventListener("click", () => {
    input.value = String(Number(input.value || 1) + 1);
  });

  minus.addEventListener("click", () => {
    const next = Math.max(1, Number(input.value || 1) - 1);
    input.value = String(next);
  });
}

function selectedOption(rootId, attr) {
  const node = document.querySelector(`#${rootId} .active`);
  return node ? node.getAttribute(attr) : "";
}

function setupAddActions(product) {
  const addBtn = document.getElementById("pdp-add-to-cart");
  const buyBtn = document.getElementById("pdp-buy-now");
  const stickyBtn = document.getElementById("sticky-add-btn");

  const add = () => {
    const qty = Number(document.getElementById("qty-input")?.value || 1);
    window.LWC.addToCart(product.id, qty, {
      color: selectedOption("pdp-colors", "data-color"),
      strap: selectedOption("pdp-straps", "data-strap")
    });
  };

  addBtn?.addEventListener("click", add);
  stickyBtn?.addEventListener("click", add);

  buyBtn?.addEventListener("click", () => {
    add();
    window.location.href = "checkout.html";
  });
}

function setupLightbox() {
  const mainImage = document.getElementById("pdp-main-image");
  const lightbox = document.getElementById("lightbox");
  const image = document.getElementById("lightbox-image");
  const close = document.getElementById("lightbox-close");

  if (!mainImage || !lightbox || !image || !close) return;

  mainImage.addEventListener("click", () => {
    image.src = mainImage.src;
    lightbox.classList.add("show");
  });

  close.addEventListener("click", () => {
    lightbox.classList.remove("show");
  });

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) lightbox.classList.remove("show");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") lightbox.classList.remove("show");
  });
}

function renderTabs(product) {
  const root = document.getElementById("tab-content");
  if (!root) return;

  root.innerHTML = `
    <section class="tab-panel active" id="tab-description" role="tabpanel">
      <p>${product.description}</p>
      <p>Built with reliable movement and durable materials, this watch is designed for daily wear and long-lasting style.</p>
    </section>
    <section class="tab-panel" id="tab-features" role="tabpanel">
      <ul>
        ${product.features.map((feature) => `<li>${feature}</li>`).join("")}
      </ul>
    </section>
    <section class="tab-panel" id="tab-warranty" role="tabpanel">
      <p><strong>Warranty:</strong> ${product.warranty}</p>
      <p>Enjoy secure shipping, 7-day returns, and dedicated support for exchanges or service requests.</p>
    </section>
    <section class="tab-panel" id="tab-reviews" role="tabpanel">
      <p><strong>Average Rating:</strong> ${product.rating}/5 from ${product.reviews} verified buyers.</p>
      <p>"Excellent build quality and premium packaging."</p>
      <p>"Exactly like the photos, great dial finish and strap comfort."</p>
    </section>
  `;
}

function initTabs() {
  const tabs = document.querySelectorAll("[data-tab-target]");
  const content = document.getElementById("tab-content");
  if (!tabs.length || !content) return;

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((node) => node.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.getAttribute("data-tab-target");
      content.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.classList.toggle("active", panel.id === target);
      });
    });
  });
}

function renderRelated(product) {
  const root = document.getElementById("related-track");
  if (!root) return;

  const related = window.LWC.data.products
    .filter((item) => item.id !== product.id && item.collection === product.collection)
    .slice(0, 8);

  root.innerHTML = related.map((item) => window.LWC.createProductCard(item, {})).join("");

  const prev = document.getElementById("related-prev");
  const next = document.getElementById("related-next");

  const offset = () => {
    const card = root.querySelector(".product-card");
    return card ? card.getBoundingClientRect().width + 14 : 320;
  };

  prev?.addEventListener("click", () => {
    root.scrollBy({ left: -offset(), behavior: "smooth" });
  });

  next?.addEventListener("click", () => {
    root.scrollBy({ left: offset(), behavior: "smooth" });
  });

  window.LWC.syncWishlistButtons();
}

function initStickyBar(product) {
  const bar = document.getElementById("sticky-add-bar");
  const trigger = document.getElementById("buy-actions");
  if (!bar || !trigger) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        bar.classList.toggle("show", !entry.isIntersecting);
      });
    },
    { threshold: 0.2 }
  );

  observer.observe(trigger);
}

function injectStructuredData(product) {
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(window.LWC.buildProductJsonLd(product));
  document.head.appendChild(script);
}

function fitHint(caseSize) {
  const size = Number.parseInt(caseSize, 10);
  if (Number.isNaN(size)) return caseSize || "Designed for comfortable all-day wear.";
  if (size <= 36) return `${caseSize} is ideal for compact and elegant wrist styling.`;
  if (size <= 42) return `${caseSize} offers a balanced classic look for most wrists.`;
  return `${caseSize} creates a bold statement look on wrist.`;
}
