import QRCode from "qrcode";

async function renderQrCodes(root: ParentNode = document): Promise<void> {
  const canvases = root.querySelectorAll<HTMLCanvasElement>("canvas[data-mfa-qr]");
  await Promise.all(Array.from(canvases, async (canvas) => {
    const provisioningUri = canvas.dataset.mfaQr;
    if (!provisioningUri || canvas.dataset.mfaQrRendered === "true") return;
    await QRCode.toCanvas(canvas, provisioningUri, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 224,
      color: { dark: "#111827", light: "#ffffff" },
    });
    canvas.dataset.mfaQrRendered = "true";
  }));
}

function render(): void {
  void renderQrCodes().catch(() => {
    // The manual key and local authenticator link remain available.
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", render, { once: true });
} else {
  render();
}

document.addEventListener("htmx:afterSwap", render);
