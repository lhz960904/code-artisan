import type { SelectedElement } from "@code-artisan/shared";
import type { MessageBus } from "./message-bus";

const PICKER_ATTR = "data-ca-picker";
const MAX_SELECTOR_DEPTH = 6;
const MAX_CLASSNAMES_PER_NODE = 4;
const MAX_TEXT_CONTENT = 200;
const NEAREST_UNIQUE_TEXT_DEPTH = 4;
const NEAREST_UNIQUE_TEXT_MIN = 6;
const NEAREST_UNIQUE_TEXT_MAX = 80;

const BLOCKED_MOUSE_EVENTS = [
  "mouseover",
  "mouseout",
  "mouseenter",
  "mouseleave",
  "mousedown",
  "mouseup",
  "dblclick",
  "contextmenu",
] as const;

export function setupElementPicker(bus: MessageBus): void {
  let active = false;
  let outlineEl: HTMLDivElement | null = null;
  let hintEl: HTMLDivElement | null = null;
  let lastTarget: HTMLElement | null = null;

  function enter() {
    if (active) return;
    active = true;
    document.documentElement.style.cursor = "crosshair";
    outlineEl = createOutline();
    hintEl = createHint();
    document.body.appendChild(outlineEl);
    document.body.appendChild(hintEl);
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    for (const eventName of BLOCKED_MOUSE_EVENTS) {
      document.addEventListener(eventName, blockEvent, true);
    }
    bus.send({ type: "pick-mode-changed", payload: { active: true } });
  }

  function exit() {
    if (!active) return;
    active = false;
    document.documentElement.style.cursor = "";
    outlineEl?.remove();
    hintEl?.remove();
    outlineEl = null;
    hintEl = null;
    lastTarget = null;
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    for (const eventName of BLOCKED_MOUSE_EVENTS) {
      document.removeEventListener(eventName, blockEvent, true);
    }
    bus.send({ type: "pick-mode-changed", payload: { active: false } });
  }

  function blockEvent(event: Event) {
    event.stopPropagation();
  }

  function onMouseMove(event: MouseEvent) {
    event.stopPropagation();
    const target = event.target as HTMLElement | null;
    if (!target || isPickerOwn(target)) return;
    if (target === lastTarget) return;
    lastTarget = target;
    positionOutline(target);
  }

  function onClick(event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    const target = event.target as HTMLElement | null;
    if (!target || isPickerOwn(target)) return;
    bus.send({ type: "element-selected", payload: extractInfo(target) });
    exit();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      exit();
    }
  }

  bus.on((message) => {
    if (message.type === "enter-pick-mode") enter();
    if (message.type === "exit-pick-mode") exit();
  });
}

function isPickerOwn(el: HTMLElement): boolean {
  return !!el.closest(`[${PICKER_ATTR}]`);
}

function createOutline(): HTMLDivElement {
  const div = document.createElement("div");
  div.setAttribute(PICKER_ATTR, "outline");
  div.style.cssText = [
    "position: fixed",
    "pointer-events: none",
    "z-index: 2147483647",
    "border: 2px solid rgb(59, 130, 246)",
    "background: rgba(59, 130, 246, 0.12)",
    "transition: top 80ms ease-out, left 80ms ease-out, width 80ms ease-out, height 80ms ease-out",
    "box-sizing: border-box",
    "border-radius: 2px",
  ].join(";");
  return div;
}

function positionOutline(target: HTMLElement) {
  const outline = document.querySelector(`[${PICKER_ATTR}="outline"]`);
  if (!(outline instanceof HTMLElement)) return;
  const rect = target.getBoundingClientRect();
  outline.style.top = `${rect.top}px`;
  outline.style.left = `${rect.left}px`;
  outline.style.width = `${rect.width}px`;
  outline.style.height = `${rect.height}px`;
}

function createHint(): HTMLDivElement {
  const div = document.createElement("div");
  div.setAttribute(PICKER_ATTR, "hint");
  div.style.cssText = [
    "position: fixed",
    "bottom: 16px",
    "left: 50%",
    "transform: translateX(-50%)",
    "z-index: 2147483647",
    "pointer-events: none",
    "background: rgba(0, 0, 0, 0.85)",
    "color: white",
    "padding: 8px 14px",
    "border-radius: 6px",
    "font: 500 13px system-ui, -apple-system, sans-serif",
    "box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25)",
    "white-space: nowrap",
  ].join(";");
  div.textContent = "Click an element to select · Esc to cancel";
  return div;
}

function extractInfo(target: HTMLElement): SelectedElement {
  return {
    selector: buildSelector(target),
    tagName: target.tagName.toLowerCase(),
    textContent: normaliseText(target.textContent ?? "").slice(0, MAX_TEXT_CONTENT),
    nearestUniqueText: findNearestUniqueText(target),
    pathname: window.location.pathname,
    timestamp: Date.now(),
  };
}

function normaliseText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function buildSelector(el: HTMLElement): string {
  const parts: string[] = [];
  let node: HTMLElement | null = el;
  for (let depth = 0; node && depth < MAX_SELECTOR_DEPTH; depth++) {
    const current: HTMLElement = node;
    let part = current.tagName.toLowerCase();
    if (current.id) {
      part += `#${cssEscape(current.id)}`;
      parts.unshift(part);
      break;
    }
    const classes = (typeof current.className === "string" ? current.className : "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, MAX_CLASSNAMES_PER_NODE);
    if (classes.length) part += "." + classes.map(cssEscape).join(".");
    const parent: HTMLElement | null = current.parentElement;
    if (parent) {
      const sameTagSiblings: Element[] = [];
      for (const child of Array.from(parent.children)) {
        if (child.tagName === current.tagName) sameTagSiblings.push(child);
      }
      if (sameTagSiblings.length > 1) {
        part += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
      }
    }
    parts.unshift(part);
    node = parent;
  }
  return parts.join(" > ");
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/[^\w-]/g, "\\$&");
}

function findNearestUniqueText(start: HTMLElement): string | undefined {
  let node: HTMLElement | null = start;
  for (let depth = 0; node && depth < NEAREST_UNIQUE_TEXT_DEPTH; depth++) {
    const text = normaliseText(node.textContent ?? "");
    if (text.length >= NEAREST_UNIQUE_TEXT_MIN && text.length <= NEAREST_UNIQUE_TEXT_MAX) {
      if (countTextOccurrences(text) === 1) return text;
    }
    node = node.parentElement;
  }
  return undefined;
}

function countTextOccurrences(needle: string): number {
  const haystack = document.body?.innerText ?? document.body?.textContent ?? "";
  let count = 0;
  let index = 0;
  while ((index = haystack.indexOf(needle, index)) !== -1) {
    count++;
    if (count > 1) return count;
    index += needle.length;
  }
  return count;
}
