import { createMessageBus } from "./message-bus";
import { setupErrorReporter } from "./error-reporter";
import { setupElementPicker } from "./element-picker";

declare global {
  interface Window {
    __caIframeRuntime?: { version: string };
  }
}

(function init() {
  if (typeof window === "undefined") return;
  if (window.__caIframeRuntime) return;
  window.__caIframeRuntime = { version: "1" };

  const bus = createMessageBus();
  setupErrorReporter(bus);
  setupElementPicker(bus);

  const sendReady = () => bus.send({ type: "ready" });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sendReady, { once: true });
  } else {
    sendReady();
  }
})();
