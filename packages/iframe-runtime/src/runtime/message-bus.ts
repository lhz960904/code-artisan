import {
  IFRAME_BRIDGE_BRAND,
  isIframeBridgeMessage,
  type IframeToParentMessage,
  type ParentToIframeMessage,
} from "@code-artisan/shared";

export type ParentMessageHandler = (message: ParentToIframeMessage) => void;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type SendableMessage = DistributiveOmit<IframeToParentMessage, "brand">;

export interface MessageBus {
  send(message: SendableMessage): void;
  on(handler: ParentMessageHandler): () => void;
}

export function createMessageBus(): MessageBus {
  const handlers = new Set<ParentMessageHandler>();

  window.addEventListener("message", (event) => {
    if (!isIframeBridgeMessage(event.data)) return;
    if (
      event.data.type !== "enter-pick-mode" &&
      event.data.type !== "exit-pick-mode"
    ) {
      return;
    }
    handlers.forEach((handler) => handler(event.data as ParentToIframeMessage));
  });

  return {
    send(message) {
      const envelope = {
        brand: IFRAME_BRIDGE_BRAND,
        ...message,
      } as IframeToParentMessage;
      window.parent.postMessage(envelope, "*");
    },
    on(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}
