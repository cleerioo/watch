document.addEventListener("DOMContentLoaded", () => {
  const { data } = window.LWC;
  const state = {
    page: 1,
    pageSize: 8,
    brand: new Set(),
    strap: new Set(),
    type: new Set(),
    gender: new Set(),
    collection: new Set(),
    rating: new Set(),
    query: "",
    minPrice: 0,
    maxPrice: 0,
    sort: "best"
  };

  const products = data.products;
  if (!products.length) return;

  const priceValues = products.map((item) => item.price);
  const globalMin = Math.floor(Math.min(...priceValues) / 1000) * 1000;
  const globalMax = Math.ceil(Math.max(...priceValues) / 1000) * 1000;
  state.minPrice = globalMin;
  state.maxPrice = globalMax;

  const refs = {
    grid: document.getElementById("shop-grid"),
    pagination: document.getElementById("shop-pagination"),
    count: document.getElementById("shop-count"),
    search: document.getElementById("filter-search"),
    sort: document.getElementById("sort-select"),
    minRange: document.getElementById("price-min-range"),
    maxRange: document.getElementById("price-max-range"),
    minInput: document.getElementById("price-min-input"),
    maxInput: document.getElementById("price-max-input")
  };

  initFilterList("brand-filters", uniqueValues("brand"), state.brand);
  initFilterList("strap-filters", uniqueValues("strapType"), state.strap);
  initFilterList("type-filters", uniqueValues("type"), state.type);
  initFilterList("gender-filters", uniqueValues("gender"), state.gender);
  initFilterList("collection-filters", uniqueValues("collection"), state.collection);
  initRatingFilters();
  initRangeControls();
  applyUrlFilters();
  bindEvents();
  applyFilters();

  function uniqueValues(key) {
    return [...new Set(products.map((item) => item[key]))].filter(Boolean).sort();
  }

  function initFilterList(containerId, values, stateSet) {
    const root = document.getElementById(containerId);
    if (!root) return;

    root.innerHTML = values
      .map(
        (value) =>
          `<label><input type="checkbox" value="${value}" data-filter="${containerId}" /> ${value}</label>`
      )
      .join("");

    root.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.checked) {
        stateSet.add(target.value);
      } else {
        stateSet.delete(target.value);
      }
      state.page = 1;
      applyFilters();
    });
  }

  function initRatingFilters() {
    const root = document.getElementById("rating-filters");
    if (!root) return;

    const options = [4.5, 4, 3.5];
    root.innerHTML = options
      .map(
        (value) =>
          `<label><input type="checkbox" value="${value}" data-rating /> ${value}+ stars</label>`
      )
      .join("");

    root.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const value = Number(target.value);
      if (target.checked) {
        state.rating.add(value);
      } else {
        state.rating.delete(value);
      }
      state.page = 1;
      applyFilters();
    });
  }

  function initRangeControls() {
    if (!refs.minRange || !refs.maxRange || !refs.minInput || !refs.maxInput) return;

    refs.minRange.min = String(globalMin);
    refs.minRange.max = String(globalMax);
    refs.maxRange.min = String(globalMin);
    refs.maxRange.max = String(globalMax);

    refs.minRange.value = String(globalMin);
    refs.maxRange.value = String(globalMax);
    refs.minInput.value = String(globalMin);
    refs.maxInput.value = String(globalMax);

    const sync = (source) => {
      let min = Number(refs.minRange.value);
      let max = Number(refs.maxRange.value);

      if (source === "input") {
        min = Number(refs.minInput.value || globalMin);
        max = Number(refs.maxInput.value || globalMax);
      }

      if (min > max - 500) {
        if (source === "min") {
          min = max - 500;
        } else {
          max = min + 500;
        }
      }

      min = Math.max(globalMin, min);
      max = Math.min(globalMax, max);

      state.minPrice = min;
      state.maxPrice = max;

      refs.minRange.value = String(min);
      refs.maxRange.value = String(max);
      refs.minInput.value = String(min);
      refs.maxInput.value = String(max);

      state.page = 1;
      applyFilters();
    };

    refs.minRange.addEventListener("input", () => sync("min"));
    refs.maxRange.addEventListener("input", () => sync("max"));
    refs.minInput.addEventListener("change", () => sync("input"));
    refs.maxInput.addEventListener("change", () => sync("input"));
  }

  function applyUrlFilters() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const collection = params.get("collection");
    const gender = params.get("gender");
    const type = params.get("type");
    const sort = params.get("sort");

    if (q) {
      state.query = q;
      refs.search.value = q;
    }

    if (collection) {
      state.collection.add(collection);
      precheck("collection-filters", collection);
    }

    if (gender) {
      state.gender.add(gender);
      precheck("gender-filters", gender);
    }

    if (type) {
      state.type.add(type);
      precheck("type-filters", type);
    }

    if (sort) {
      state.sort = sort;
      refs.sort.value = sort;
    }
  }

  function precheck(filterId, value) {
    document
      .querySelectorAll(`#${filterId} input[type="checkbox"]`)
      .forEach((box) => {
        if (box.value === value) box.checked = true;
      });
  }

  function bindEvents() {
    refs.search?.addEventListener("input", () => {
      state.query = refs.search.value.trim();
      state.page = 1;
      applyFilters();
    });

    refs.sort?.addEventListener("change", () => {
      state.sort = refs.sort.value;
      state.page = 1;
      applyFilters();
    });
  }

  function applyFilters() {
    let result = [...products];

    if (state.query) {
      const q = state.query.toLowerCase();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.brand.toLowerCase().includes(q) ||
          item.collection.toLowerCase().includes(q)
      );
    }

    result = result.filter((item) => item.price >= state.minPrice && item.price <= state.maxPrice);

    result = result.filter((item) => matchesSet(item.brand, state.brand));
    result = result.filter((item) => matchesSet(item.strapType, state.strap));
    result = result.filter((item) => matchesSet(item.type, state.type));
    result = result.filter((item) => matchesSet(item.gender, state.gender));
    result = result.filter((item) => matchesSet(item.collection, state.collection));

    if (state.rating.size) {
      const minRating = Math.max(...state.rating);
      result = result.filter((item) => item.rating >= minRating);
    }

    sortProducts(result);
    renderProducts(result);
  }

  function matchesSet(value, set) {
    if (!set.size) return true;
    return set.has(value);
  }

  function sortProducts(items) {
    switch (state.sort) {
      case "newest":
        items.sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.price - a.price);
        break;
      case "price-asc":
        items.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        items.sort((a, b) => b.price - a.price);
        break;
      case "best":
      default:
        items.sort((a, b) => Number(b.isTopSelling) - Number(a.isTopSelling) || b.rating - a.rating);
    }
  }

  function renderProducts(items) {
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    state.page = Math.min(state.page, totalPages);

    const start = (state.page - 1) * state.pageSize;
    const visible = items.slice(start, start + state.pageSize);

    refs.count.textContent = `${total} watch${total === 1 ? "" : "es"} found`;

    if (!visible.length) {
      refs.grid.innerHTML = `<div class="empty-state">No watches match your filters. Try widening your search.</div>`;
      refs.pagination.innerHTML = "";
      return;
    }

    refs.grid.innerHTML = visible
      .map((product) => window.LWC.createProductCard(product, {}))
      .join("");

    refs.pagination.innerHTML = Array.from({ length: totalPages }, (_item, idx) => {
      const page = idx + 1;
      return `<button class="${page === state.page ? "active" : ""}" data-page="${page}" aria-label="Go to page ${page}">${page}</button>`;
    }).join("");

    refs.pagination.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        state.page = Number(button.getAttribute("data-page"));
        renderProducts(items);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });

    window.LWC.syncWishlistButtons();
  }
});
