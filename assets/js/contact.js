document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contact-form");
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      window.LWC.showToast("Thanks. Our team will contact you within 24 hours.");
      form.reset();
    });
  }

  document.querySelectorAll(".faq-item").forEach((item) => {
    const btn = item.querySelector(".faq-q");
    btn?.addEventListener("click", () => {
      item.classList.toggle("open");
    });
  });
});
