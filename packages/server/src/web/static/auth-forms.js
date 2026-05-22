/**
 * Client-side validation for auth forms.
 * Password checklist mirrors @z0/contracts/password-policy (display rules only).
 */
(function () {
  const PASSWORD_MIN_LENGTH = 14;
  const PASSWORD_MAX_LENGTH = 128;
  const SPECIAL_CHAR_RE = /[!-/:-@[-`{-~]/;
  const WEAK_PASSWORDS = new Set(
    [
      "test",
      "test123",
      "testing",
      "password",
      "password1",
      "password123",
      "qwerty",
      "qwerty123",
      "qwerty123456",
      "123456",
      "123456789",
      "admin",
      "admin123",
      "admin123456",
      "letmein",
      "letmein123",
      "welcome",
      "welcome123",
      "changeme",
      "changeme123",
      "iloveyou",
      "monkey",
      "dragon",
      "master",
      "login",
      "abc123",
      "P@ssw0rd123!",
      "Password123!",
      "SuperAdmin123!",
    ].map((p) => p.toLowerCase()),
  );

  function passesNotWeakRule(password) {
    if (password.length < PASSWORD_MIN_LENGTH) return false;
    return !WEAK_PASSWORDS.has(password.toLowerCase());
  }

  const CHECKLIST_RULE_IDS = ["min_length", "character_mix", "not_weak", "not_contextual"];

  const SVG_CHECK = `<svg class="auth-status-icon auth-status-icon--success" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6.25" fill="none" stroke="currentColor" stroke-width="1.25"/><path fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" d="M4.5 7.25 6.1 8.85 9.75 5.35"/></svg>`;

  const SVG_CROSS = `<svg class="auth-status-icon auth-status-icon--error" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6.25" fill="none" stroke="currentColor" stroke-width="1.25"/><path fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" d="M5.1 5.1 8.9 8.9M8.9 5.1 5.1 8.9"/></svg>`;

  const SVG_WARNING = `<svg class="auth-status-icon auth-status-icon--warning" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6.25" fill="none" stroke="currentColor" stroke-width="1.25"/><path fill="currentColor" d="M7 4.25a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0V5a.75.75 0 0 1 .75-.75Zm0 6.5a.875.875 0 1 0 0-1.75.875.875 0 0 0 0 1.75Z"/></svg>`;

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

  function hasCharacterMix(password) {
    if (password.length === 0) return false;
    return (
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /\d/.test(password) &&
      SPECIAL_CHAR_RE.test(password)
    );
  }

  function testChecklistRule(id, password, ctx) {
    if (password.length === 0) return false;
    switch (id) {
      case "min_length":
        return password.length >= PASSWORD_MIN_LENGTH;
      case "character_mix":
        return hasCharacterMix(password);
      case "not_weak":
        return passesNotWeakRule(password);
      case "not_contextual":
        return !containsContextualSubstring(password, ctx);
      default:
        return true;
    }
  }

  function computePasswordStates(password, ctx, attempted) {
    const extraInvalid = password.length > PASSWORD_MAX_LENGTH;
    if (password.length > 0) {
      return {
        extraInvalid,
        states: CHECKLIST_RULE_IDS.map((id) => ({
          id,
          state: testChecklistRule(id, password, ctx) ? "met" : "failed",
        })),
      };
    }
    if (attempted) {
      return {
        extraInvalid: false,
        states: CHECKLIST_RULE_IDS.map((id) => ({ id, state: "failed" })),
      };
    }
    return {
      extraInvalid: false,
      states: CHECKLIST_RULE_IDS.map((id) => ({ id, state: "pending" })),
    };
  }

  function checklistIconHtml(state) {
    if (state === "met") return SVG_CHECK;
    if (state === "failed") return SVG_CROSS;
    return "";
  }

  function applyPasswordStates(checklist, result) {
    const { states, extraInvalid } = result;
    const anyFailed = states.some((s) => s.state === "failed") || extraInvalid;

    for (const { id, state } of states) {
      const item = checklist.querySelector(`[data-rule-id="${id}"]`);
      if (!item) continue;
      item.className = `auth-password-rule auth-password-rule--${state}`;
      const label = item.querySelector(".auth-password-rule__label")?.textContent ?? "";
      const iconWrap = item.querySelector(".auth-password-rule__icon");
      const iconHtml = checklistIconHtml(state);
      if (iconHtml) {
        if (iconWrap) iconWrap.innerHTML = iconHtml;
        else {
          const span = document.createElement("span");
          span.className = "auth-password-rule__icon";
          span.innerHTML = iconHtml;
          item.insertBefore(span, item.firstChild);
        }
      } else if (iconWrap) {
        iconWrap.remove();
      }
      item.setAttribute(
        "aria-label",
        state === "met" ? `Met: ${label}` : state === "failed" ? `Not met: ${label}` : label,
      );
    }

    let maxErr = checklist.parentElement?.querySelector(".auth-password-max-error");
    if (extraInvalid) {
      if (!maxErr) {
        maxErr = document.createElement("p");
        maxErr.className = "auth-field-error auth-password-max-error";
        maxErr.setAttribute("role", "alert");
        checklist.insertAdjacentElement("afterend", maxErr);
      }
      maxErr.innerHTML = `${SVG_WARNING}<span class="auth-field-error__text">Use at most ${PASSWORD_MAX_LENGTH} characters</span>`;
      maxErr.hidden = false;
    } else if (maxErr) {
      maxErr.hidden = true;
    }

    return anyFailed;
  }

  function updatePasswordField(input, attempted) {
    const field = fieldWrapper(input);
    const checklist = passwordChecklist(input);
    const form = input.closest("form");
    if (!field || !checklist || !form) return true;

    const ctx = passwordContext(form);
    const result = computePasswordStates(input.value, ctx, attempted);
    const anyFailed = applyPasswordStates(checklist, result);

    field.classList.toggle("auth-field--invalid", anyFailed);
    input.toggleAttribute("aria-invalid", anyFailed);
    input.setAttribute("aria-describedby", "password-hint");

    const err = errorEl(input);
    if (err) {
      err.hidden = true;
      err.innerHTML = "";
    }

    return !anyFailed;
  }

  function showFieldError(err, message) {
    err.innerHTML = `${SVG_WARNING}<span class="auth-field-error__text">${escapeHtml(message)}</span>`;
    err.hidden = false;
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
      showFieldError(err, message);
      if (err.id) input.setAttribute("aria-describedby", err.id);
      if (hints) hints.hidden = true;
    } else {
      field.classList.remove("auth-field--invalid");
      input.removeAttribute("aria-invalid");
      err.innerHTML = "";
      err.hidden = true;
      if (hints) {
        hints.hidden = false;
        if (hints.querySelector("[id]")?.id) {
          input.setAttribute("aria-describedby", hints.querySelector("[id]").id);
        }
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
      const attempted =
        password.closest(".auth-field")?.classList.contains("auth-field--invalid") ||
        password.value.length > 0;
      updatePasswordField(password, attempted);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
