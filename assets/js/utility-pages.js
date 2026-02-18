document.addEventListener("DOMContentLoaded", () => {
  const trackForm = document.getElementById("track-order-form");
  const result = document.getElementById("track-result");

  trackForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const orderId = trackForm.orderId.value.trim() || "BH49-00000000";
    const timeline = [
      "Order confirmed",
      "Quality check complete",
      "Packed at fulfillment center",
      "In transit",
      "Expected delivery in 2-4 business days"
    ];

    result.innerHTML = `
      <div class="sidebar-card" style="margin-top: 14px;">
        <strong>Status for ${orderId}</strong>
        <ul>
          ${timeline.map((step) => `<li>${step}</li>`).join("")}
        </ul>
      </div>
    `;
  });
});
