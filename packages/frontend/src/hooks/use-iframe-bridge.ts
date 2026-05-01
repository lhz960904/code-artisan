import { useEffect, type RefObject } from "react";
import { isIframeBridgeMessage, type IframeToParentMessage } from "@code-artisan/shared";
import { useWorkspaceStore } from "@/stores/workspace";

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
    if (!expectedOrigin) return;

    const appendBrowserError = useWorkspaceStore.getState().appendBrowserError;
    const setIframeRuntimeReady = useWorkspaceStore.getState().setIframeRuntimeReady;

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
        case "pick-mode-changed":
          break;
      }
    }

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      setIframeRuntimeReady(false);
    };
  }, [previewUrl, iframeRef]);
}
