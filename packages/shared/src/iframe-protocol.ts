export const IFRAME_BRIDGE_BRAND = "ca:iframe-bridge:v1" as const;

export type BrowserErrorSource =
  | "window.error"
  | "unhandledrejection"
  | "console.error";

export interface BrowserError {
  source: BrowserErrorSource;
  message: string;
  stack?: string;
  filename?: string;
  line?: number;
  column?: number;
  timestamp: number;
}

export interface SelectedElement {
  selector: string;
  tagName: string;
  textContent: string;
  nearestUniqueText?: string;
  pathname: string;
  timestamp: number;
}

interface BaseMessage {
  brand: typeof IFRAME_BRIDGE_BRAND;
}

export interface IframeReadyMessage extends BaseMessage {
  type: "ready";
}

export interface IframeErrorMessage extends BaseMessage {
  type: "error";
  payload: BrowserError;
}

export interface IframeElementSelectedMessage extends BaseMessage {
  type: "element-selected";
  payload: SelectedElement;
}

export interface IframePickModeChangedMessage extends BaseMessage {
  type: "pick-mode-changed";
  payload: { active: boolean };
}

export type IframeToParentMessage =
  | IframeReadyMessage
  | IframeErrorMessage
  | IframeElementSelectedMessage
  | IframePickModeChangedMessage;

export interface ParentEnterPickModeMessage extends BaseMessage {
  type: "enter-pick-mode";
}

export interface ParentExitPickModeMessage extends BaseMessage {
  type: "exit-pick-mode";
}

export type ParentToIframeMessage =
  | ParentEnterPickModeMessage
  | ParentExitPickModeMessage;

export type IframeBridgeMessage = IframeToParentMessage | ParentToIframeMessage;

export function isIframeBridgeMessage(data: unknown): data is IframeBridgeMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { brand?: unknown }).brand === IFRAME_BRIDGE_BRAND
  );
}
