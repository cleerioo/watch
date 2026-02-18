document.addEventListener("DOMContentLoaded", () => {
  setupLogin();
  setupRegister();
  setupForgotPassword();
});

function setupLogin() {
  const form = document.getElementById("login-form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');
    const email = form.email.value.trim().toLowerCase();
    const password = form.password.value;

    if (!email || !password) {
      window.LWC.showToast("Please enter email and password.");
      return;
    }

    toggleButtonState(submitBtn, true, "Logging in...");

    try {
      await window.LWC.apiLogin({ email, password });
      window.LWC.showToast("Login successful.");

      const params = new URLSearchParams(window.location.search);
      const redirect = params.get("redirect") || "account.html";

      setTimeout(() => {
        window.location.href = redirect;
      }, 600);
    } catch (error) {
      window.LWC.showToast(error.message || "Unable to login. Please try again.");
    } finally {
      toggleButtonState(submitBtn, false, "Login");
    }
  });
}

function setupRegister() {
  const form = document.getElementById("register-form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');
    const payload = {
      name: form.name.value.trim(),
      email: form.email.value.trim().toLowerCase(),
      phone: form.phone.value.trim(),
      password: form.password.value
    };

    if (!payload.name || !payload.email || !payload.password) {
      window.LWC.showToast("Please complete all required fields.");
      return;
    }

    toggleButtonState(submitBtn, true, "Creating...");

    try {
      await window.LWC.apiRegister(payload);
      window.LWC.showToast("Registration complete.");

      setTimeout(() => {
        window.location.href = "account.html";
      }, 700);
    } catch (error) {
      window.LWC.showToast(error.message || "Unable to register right now.");
    } finally {
      toggleButtonState(submitBtn, false, "Register");
    }
  });
}

function setupForgotPassword() {
  const form = document.getElementById("forgot-form");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = form.email.value.trim().toLowerCase();

    if (!email) {
      window.LWC.showToast("Please enter your email.");
      return;
    }

    window.LWC.showToast("Password reset link sent to your email (demo).");
    form.reset();
  });
}

function toggleButtonState(button, pending, pendingText) {
  if (!button) return;

  if (pending) {
    button.dataset.defaultText = button.textContent;
    button.textContent = pendingText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.defaultText || button.textContent;
    button.disabled = false;
  }
}
