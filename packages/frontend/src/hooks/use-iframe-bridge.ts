import { useEffect, type RefObject } from "react";
import {
  IFRAME_BRIDGE_BRAND,
  isIframeBridgeMessage,
  type IframeToParentMessage,
} from "@code-artisan/shared";
import { useWorkspaceStore, type IframeBridgeSender } from "@/stores/workspace";

function getOrigin(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function useIframeBridge(iframeRef: RefObject<HTMLIFrameElement | null>): void {
  const previewUrl = useWorkspaceStore((s) => s.previewUrl);

  useEffect(() => {
    const expectedOrigin = getOrigin(previewUrl);
    const {
      appendBrowserError,
      setIframeRuntimeReady,
      setSelectedElement,
      setPickModeActive,
      setIframeBridgeSend,
    } = useWorkspaceStore.getState();

    if (!expectedOrigin) {
      setIframeBridgeSend(null);
      return;
    }

    const send: IframeBridgeSender = (message) => {
      const target = iframeRef.current?.contentWindow;
      if (!target) return;
      target.postMessage({ brand: IFRAME_BRIDGE_BRAND, ...message }, expectedOrigin);
    };
    setIframeBridgeSend(send);

    function handleMessage(event: MessageEvent) {
      if (event.origin !== expectedOrigin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!isIframeBridgeMessage(event.data)) return;

      const message = event.data as IframeToParentMessage;
      switch (message.type) {
        case "ready":
          setIframeRuntimeReady(true);
          break;
        case "error":
          appendBrowserError(message.payload);
          break;
        case "element-selected":
          setSelectedElement(message.payload);
          setPickModeActive(false);
          break;
        case "pick-mode-changed":
          setPickModeActive(message.payload.active);
          break;
      }
    }

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      setIframeRuntimeReady(false);
      setPickModeActive(false);
      setIframeBridgeSend(null);
    };
  }, [previewUrl, iframeRef]);
}
