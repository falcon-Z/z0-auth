/**
 * Client-side validation for auth forms: inline errors replace browser bubbles.
 * Password fields use a live checklist (✓ / ✗) aligned with @z0/contracts/password-policy.
 */
(function () {
  const PASSWORD_MIN_LENGTH = 14;
  const PASSWORD_MAX_LENGTH = 128;
  const SPECIAL_CHAR_RE = /[!-/:-@[-`{-~]/;
  const WEAK_PASSWORDS = new Set(
    [
      "password",
      "password1",
      "password123",
      "qwerty123456",
      "admin123456",
      "letmein123",
      "welcome123",
      "changeme123",
      "P@ssw0rd123!",
      "Password123!",
      "SuperAdmin123!",
    ].map((p) => p.toLowerCase()),
  );

  const PASSWORD_RULE_IDS = [
    "min_length",
    "max_length",
    "uppercase",
    "lowercase",
    "digit",
    "special",
    "not_weak",
    "not_contextual",
  ];

  function fieldWrapper(input) {
    return input.closest(".auth-field");
  }

  function errorEl(input) {
    const field = fieldWrapper(input);
    return field?.querySelector(".auth-field-error") ?? null;
  }

  function hintBlock(input) {
    const field = fieldWrapper(input);
    return field?.querySelector(".auth-field-hint") ?? null;
  }

  function isPasswordField(input) {
    return Boolean(input.closest("[data-password-field]"));
  }

  function passwordChecklist(input) {
    const field = fieldWrapper(input);
    return field?.querySelector(".auth-password-checklist") ?? null;
  }

  function passwordContext(form) {
    return {
      name: form.querySelector("#name")?.value ?? "",
      email: form.querySelector("#email")?.value ?? "",
    };
  }

  function containsContextualSubstring(password, ctx) {
    const lower = password.toLowerCase();
    const parts = [];
    if (ctx.name && ctx.name.trim().length >= 3) {
      parts.push(ctx.name.trim().toLowerCase());
    }
    if (ctx.email) {
      const local = ctx.email.split("@")[0]?.trim().toLowerCase();
      if (local && local.length >= 3) parts.push(local);
    }
    return parts.some((part) => lower.includes(part));
  }

  function testPasswordRule(id, password, ctx) {
    if (password.length === 0) return false;
    switch (id) {
      case "min_length":
        return password.length >= PASSWORD_MIN_LENGTH;
      case "max_length":
        return password.length <= PASSWORD_MAX_LENGTH;
      case "uppercase":
        return /[A-Z]/.test(password);
      case "lowercase":
        return /[a-z]/.test(password);
      case "digit":
        return /\d/.test(password);
      case "special":
        return SPECIAL_CHAR_RE.test(password);
      case "not_weak":
        return !WEAK_PASSWORDS.has(password.toLowerCase());
      case "not_contextual":
        return !containsContextualSubstring(password, ctx);
      default:
        return true;
    }
  }

  function computePasswordStates(password, ctx, attempted) {
    if (password.length > 0) {
      return PASSWORD_RULE_IDS.map((id) => ({
        id,
        state: testPasswordRule(id, password, ctx) ? "met" : "failed",
      }));
    }
    if (attempted) {
      return PASSWORD_RULE_IDS.map((id) => ({ id, state: "failed" }));
    }
    return PASSWORD_RULE_IDS.map((id) => ({ id, state: "pending" }));
  }

  function applyPasswordStates(checklist, states) {
    const anyFailed = states.some((s) => s.state === "failed");
    checklist.classList.toggle("auth-password-checklist--invalid", anyFailed);

    for (const { id, state } of states) {
      const item = checklist.querySelector(`[data-rule-id="${id}"]`);
      if (!item) continue;
      item.className = `auth-password-rule auth-password-rule--${state}`;
      const label = item.querySelector("span:last-child")?.textContent ?? "";
      const icon = item.querySelector(".auth-password-rule__icon");
      if (icon) icon.textContent = state === "met" ? "✓" : state === "failed" ? "✗" : "·";
      item.setAttribute(
        "aria-label",
        state === "met" ? `Met: ${label}` : state === "failed" ? `Not met: ${label}` : label,
      );
    }
    return anyFailed;
  }

  function updatePasswordField(input, attempted) {
    const field = fieldWrapper(input);
    const checklist = passwordChecklist(input);
    const form = input.closest("form");
    if (!field || !checklist || !form) return true;

    const ctx = passwordContext(form);
    const states = computePasswordStates(input.value, ctx, attempted);
    const anyFailed = applyPasswordStates(checklist, states);

    field.classList.toggle("auth-field--invalid", anyFailed);
    input.toggleAttribute("aria-invalid", anyFailed);
    input.setAttribute("aria-describedby", "password-hint");

    const err = errorEl(input);
    if (err) {
      err.hidden = true;
      err.textContent = "";
    }

    return !anyFailed;
  }

  function messageFor(input) {
    const validity = input.validity;
    if (validity.valid) return "";

    if (validity.valueMissing) {
      return input.dataset.msgRequired || "This field is required";
    }
    if (validity.typeMismatch && input.type === "email") {
      return input.dataset.msgEmail || "Enter an email address like name@example.com";
    }
    return input.validationMessage;
  }

  function formOf(input) {
    return input.closest("form");
  }

  function setFieldError(input, message) {
    const field = fieldWrapper(input);
    const err = errorEl(input);
    const hints = hintBlock(input);
    if (!field || !err) return;

    if (message) {
      field.classList.add("auth-field--invalid");
      input.setAttribute("aria-invalid", "true");
      err.textContent = message;
      err.hidden = false;
      if (err.id) input.setAttribute("aria-describedby", err.id);
      if (hints) hints.hidden = true;
    } else {
      field.classList.remove("auth-field--invalid");
      input.removeAttribute("aria-invalid");
      err.textContent = "";
      err.hidden = true;
      if (hints) {
        hints.hidden = false;
        if (hints.id) input.setAttribute("aria-describedby", hints.id);
      } else {
        input.removeAttribute("aria-describedby");
      }
    }
  }

  function validateInput(input, options = {}) {
    const form = formOf(input);
    if (!form) return true;

    if (isPasswordField(input)) {
      return updatePasswordField(input, options.passwordAttempted ?? false);
    }

    if (input.dataset.match) {
      const other = form.querySelector(input.dataset.match);
      if (other && input.value !== other.value) {
        setFieldError(input, input.dataset.msgMatch || "These entries do not match");
        return false;
      }
    }

    if (!input.checkValidity()) {
      setFieldError(input, messageFor(input));
      return false;
    }

    setFieldError(input, "");
    return true;
  }

  function invalidInputs(form, options = {}) {
    const inputs = [...form.querySelectorAll("input, select, textarea")].filter(
      (el) => el.name && el.type !== "hidden" && !el.disabled,
    );
    const bad = [];
    for (const input of inputs) {
      if (!validateInput(input, options)) bad.push(input);
    }
    return bad;
  }

  function onSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-validate")) return;

    const invalid = invalidInputs(form, { passwordAttempted: true });
    if (invalid.length > 0) {
      event.preventDefault();
      invalid[0].focus();
    }
  }

  function onInput(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.closest("form[data-validate]")) return;
    if (!fieldWrapper(input)) return;

    const opts = isPasswordField(input) ? { passwordAttempted: input.value.length > 0 } : {};
    validateInput(input, opts);

    if (input.id === "password" || input.id === "name" || input.id === "email") {
      const password = form.querySelector("#password");
      if (password instanceof HTMLInputElement && isPasswordField(password)) {
        updatePasswordField(password, password.value.length > 0);
      }
    }
  }

  function init() {
    document.querySelectorAll("form[data-validate]").forEach((form) => {
      form.setAttribute("novalidate", "");
      form.addEventListener("submit", onSubmit);
      form.addEventListener("input", onInput);
    });

    const password = document.querySelector("[data-password-input]");
    if (password instanceof HTMLInputElement) {
      const attempted = password.closest(".auth-field")?.classList.contains("auth-field--invalid");
      updatePasswordField(password, Boolean(attempted));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
