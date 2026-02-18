document.addEventListener("DOMContentLoaded", () => {
  const { data, createProductCard } = window.LWC;

  renderHero(data.heroSlides || []);
  renderFeaturedCollections(data.featuredCollections || []);
  renderProductSections();
  setupCarouselControls();
});

function renderHero(slides) {
  const track = document.getElementById("hero-track");
  const dotsWrap = document.getElementById("hero-dots");
  if (!track || !dotsWrap || !slides.length) return;

  track.innerHTML = slides
    .map(
      (slide, index) => `
        <article class="hero-slide ${index === 0 ? "active" : ""}">
          <img class="hero-bg" src="${slide.image}" alt="${slide.title}" loading="${
        index ? "lazy" : "eager"
      }" />
          <div class="hero-content">
            <p class="eyebrow">BrandsHub49</p>
            <h1>${slide.title}</h1>
            <p>${slide.subtitle}</p>
            <a class="btn btn-gold" href="${slide.link}">${slide.cta}</a>
          </div>
        </article>
      `
    )
    .join("");

  dotsWrap.innerHTML = slides
    .map(
      (_item, index) =>
        `<button class="hero-dot ${index === 0 ? "active" : ""}" aria-label="Go to slide ${
          index + 1
        }" data-hero-dot="${index}"></button>`
    )
    .join("");

  let active = 0;
  const slideNodes = Array.from(track.querySelectorAll(".hero-slide"));
  const dotNodes = Array.from(dotsWrap.querySelectorAll(".hero-dot"));

  const updateSlide = (nextIndex) => {
    slideNodes[active].classList.remove("active");
    dotNodes[active].classList.remove("active");
    active = nextIndex;
    slideNodes[active].classList.add("active");
    dotNodes[active].classList.add("active");
  };

  dotsWrap.addEventListener("click", (event) => {
    const dot = event.target.closest("[data-hero-dot]");
    if (!dot) return;
    updateSlide(Number(dot.getAttribute("data-hero-dot")));
  });

  setInterval(() => {
    const next = (active + 1) % slides.length;
    updateSlide(next);
  }, 5000);
}

function renderFeaturedCollections(collections) {
  const root = document.getElementById("featured-collections");
  if (!root) return;

  root.innerHTML = collections
    .map(
      (collection) => `
      <a class="collection-tile" href="${collection.link}" aria-label="Browse ${collection.title}">
        <img loading="lazy" src="${collection.image}" alt="${collection.title}" />
        <span>${collection.title} <strong>→</strong></span>
      </a>
    `
    )
    .join("");
}

function renderProductSections() {
  const topRoot = document.getElementById("top-selling-track");
  const newRoot = document.getElementById("new-arrivals-grid");
  if (!topRoot || !newRoot) return;

  const { data, createProductCard } = window.LWC;

  const topSelling = data.products.filter((item) => item.isTopSelling).slice(0, 8);
  const newArrivals = data.products
    .filter((item) => item.isNew)
    .slice(0, 8)
    .concat(data.products.slice(0, 8))
    .slice(0, 8);

  topRoot.innerHTML = topSelling.map((product) => createProductCard(product, {})).join("");
  newRoot.innerHTML = newArrivals
    .map((product) => createProductCard(product, { quickActions: true }))
    .join("");

  window.LWC.syncWishlistButtons();
}

function setupCarouselControls() {
  document.querySelectorAll("[data-carousel]").forEach((shell) => {
    const trackId = shell.getAttribute("data-carousel");
    const track = document.getElementById(trackId);
    if (!track) return;

    const prev = shell.querySelector(".carousel-control.prev");
    const next = shell.querySelector(".carousel-control.next");

    const scrollBy = () => {
      const card = track.querySelector(".product-card");
      return card ? card.getBoundingClientRect().width + 14 : 320;
    };

    prev?.addEventListener("click", () => {
      track.scrollBy({ left: -scrollBy(), behavior: "smooth" });
    });

    next?.addEventListener("click", () => {
      track.scrollBy({ left: scrollBy(), behavior: "smooth" });
    });
  });
}
