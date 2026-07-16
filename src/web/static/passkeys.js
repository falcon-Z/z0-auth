(function () {
  "use strict";

  function csrfToken() {
    var input = document.querySelector('input[name="_csrf"]');
    return input && input.value ? input.value : "";
  }

  function fromBase64url(value) {
    var base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    base64 += "=".repeat((4 - (base64.length % 4)) % 4);
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function toBase64url(value) {
    if (value === null || value === undefined) return undefined;
    var bytes = new Uint8Array(value);
    var binary = "";
    for (var i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function creationOptions(options) {
    return Object.assign({}, options, {
      challenge: fromBase64url(options.challenge),
      user: Object.assign({}, options.user, { id: fromBase64url(options.user.id) }),
      excludeCredentials: (options.excludeCredentials || []).map(function (item) {
        return Object.assign({}, item, { id: fromBase64url(item.id) });
      }),
    });
  }

  function requestOptions(options) {
    return Object.assign({}, options, {
      challenge: fromBase64url(options.challenge),
      allowCredentials: (options.allowCredentials || []).map(function (item) {
        return Object.assign({}, item, { id: fromBase64url(item.id) });
      }),
    });
  }

  function registrationResponse(credential) {
    var response = credential.response;
    return {
      id: credential.id,
      rawId: toBase64url(credential.rawId),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment || undefined,
      clientExtensionResults: credential.getClientExtensionResults(),
      response: {
        clientDataJSON: toBase64url(response.clientDataJSON),
        attestationObject: toBase64url(response.attestationObject),
        transports: typeof response.getTransports === "function" ? response.getTransports() : [],
        publicKeyAlgorithm: typeof response.getPublicKeyAlgorithm === "function" ? response.getPublicKeyAlgorithm() : undefined,
        publicKey: typeof response.getPublicKey === "function" ? toBase64url(response.getPublicKey()) : undefined,
        authenticatorData: typeof response.getAuthenticatorData === "function" ? toBase64url(response.getAuthenticatorData()) : undefined,
      },
    };
  }

  function authenticationResponse(credential) {
    var response = credential.response;
    return {
      id: credential.id,
      rawId: toBase64url(credential.rawId),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment || undefined,
      clientExtensionResults: credential.getClientExtensionResults(),
      response: {
        clientDataJSON: toBase64url(response.clientDataJSON),
        authenticatorData: toBase64url(response.authenticatorData),
        signature: toBase64url(response.signature),
        userHandle: toBase64url(response.userHandle),
      },
    };
  }

  async function api(path, body) {
    var response = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken(),
      },
      body: JSON.stringify(body || {}),
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var error = new Error(data.detail || (data.errors && data.errors[0] && data.errors[0].message) || "Passkey request failed.");
      error.code = data.errors && data.errors[0] && data.errors[0].code;
      throw error;
    }
    return data;
  }

  async function performStepUp(clientId) {
    var started = await api("/api/auth/passkeys/authentication/options", { clientId: clientId, stepUp: true });
    var credential = await navigator.credentials.get({ publicKey: requestOptions(started.options) });
    if (!credential) throw new Error("No passkey was selected.");
    await api("/api/auth/passkeys/authentication/verify", {
      response: authenticationResponse(credential),
      clientId: clientId,
    });
    window.dispatchEvent(new CustomEvent("z0:passkey-step-up"));
  }

  function showError(button, error) {
    var root = button.closest(".auth-card") || button.parentElement;
    var existing = root && root.querySelector("[data-passkey-error]");
    if (!existing && root) {
      existing = document.createElement("p");
      existing.className = "auth-form-error";
      existing.setAttribute("role", "alert");
      existing.setAttribute("data-passkey-error", "");
      root.insertBefore(existing, root.firstChild);
    }
    if (existing) {
      existing.hidden = false;
      existing.textContent = error instanceof Error ? error.message : "Passkey request failed.";
    }
  }

  async function authenticate(button, stepUp) {
    button.disabled = true;
    try {
      var emailInput = document.querySelector('input[name="email"]');
      var body = {
        email: emailInput ? emailInput.value : "",
        clientId: button.getAttribute("data-client-id") || undefined,
        returnTo: button.getAttribute("data-return-to") || undefined,
        stepUp: Boolean(stepUp),
      };
      if (!stepUp && !body.email.trim()) throw new Error("Enter your email address first.");
      var started = await api("/api/auth/passkeys/authentication/options", body);
      var credential = await navigator.credentials.get({ publicKey: requestOptions(started.options) });
      if (!credential) throw new Error("No passkey was selected.");
      var finished = await api("/api/auth/passkeys/authentication/verify", {
        response: authenticationResponse(credential),
        clientId: body.clientId,
      });
      if (stepUp) window.dispatchEvent(new CustomEvent("z0:passkey-step-up"));
      else window.location.assign(finished.returnPath || "/");
    } catch (error) {
      if (error && error.name === "NotAllowedError") showError(button, new Error("Passkey sign-in was cancelled or no matching passkey is available."));
      else showError(button, error);
    } finally {
      button.disabled = false;
    }
  }

  async function register(button, retried) {
    button.disabled = true;
    try {
      var clientId = button.getAttribute("data-client-id") || undefined;
      var started = await api("/api/auth/passkeys/registration/options", { clientId: clientId });
      var credential = await navigator.credentials.create({ publicKey: creationOptions(started.options) });
      if (!credential) throw new Error("No passkey was created.");
      await api("/api/auth/passkeys/registration/verify", {
        clientId: clientId,
        response: registrationResponse(credential),
      });
      window.location.reload();
    } catch (error) {
      if (!retried && error && error.code === "passkey_step_up_required") {
        try {
          await performStepUp(button.getAttribute("data-client-id") || undefined);
          return await register(button, true);
        } catch (stepUpError) {
          error = stepUpError;
        }
      }
      if (error && error.name === "NotAllowedError") showError(button, new Error("Passkey setup was cancelled."));
      else showError(button, error);
    } finally {
      button.disabled = false;
    }
  }

  async function manage(button, action, retried) {
    button.disabled = true;
    try {
      var clientId = button.getAttribute("data-client-id") || undefined;
      var passkeyId = button.getAttribute("data-passkey-id");
      var body = { clientId: clientId, passkeyId: passkeyId };
      if (action === "rename") {
        var label = window.prompt("Passkey name", button.getAttribute("data-passkey-label") || "");
        if (label === null) return;
        body.label = label;
      } else if (!window.confirm("Remove this passkey? Other sessions for this account will be signed out.")) {
        return;
      }
      await api("/api/auth/passkeys/" + action, body);
      window.location.reload();
    } catch (error) {
      if (!retried && action === "remove" && error && error.code === "passkey_step_up_required") {
        try {
          await performStepUp(button.getAttribute("data-client-id") || undefined);
          return await manage(button, action, true);
        } catch (stepUpError) {
          error = stepUpError;
        }
      }
      showError(button, error);
    } finally {
      button.disabled = false;
    }
  }

  function bind() {
    var supported = Boolean(window.PublicKeyCredential && navigator.credentials);
    document.querySelectorAll("[data-passkey-login]").forEach(function (button) {
      if (!supported) { button.hidden = true; return; }
      button.addEventListener("click", function () { void authenticate(button, false); });
    });
    document.querySelectorAll("[data-passkey-step-up]").forEach(function (button) {
      if (!supported) { button.hidden = true; return; }
      button.addEventListener("click", function () { void authenticate(button, true); });
    });
    document.querySelectorAll("[data-passkey-register]").forEach(function (button) {
      if (!supported) { button.disabled = true; return; }
      button.addEventListener("click", function () { void register(button); });
    });
    document.querySelectorAll("[data-passkey-rename]").forEach(function (button) {
      button.addEventListener("click", function () { void manage(button, "rename"); });
    });
    document.querySelectorAll("[data-passkey-remove]").forEach(function (button) {
      button.addEventListener("click", function () { void manage(button, "remove"); });
    });
  }

  document.addEventListener("DOMContentLoaded", bind);
})();
