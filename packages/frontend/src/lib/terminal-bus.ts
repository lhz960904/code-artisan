export type TerminalEvent =
  | { type: "start"; id: string; command: string }
  | { type: "chunk"; id: string; stream: "stdout" | "stderr"; data: string }
  | { type: "exit"; id: string; exitCode: number }
  | { type: "clear" };

type Listener = (event: TerminalEvent) => void;

const listeners = new Set<Listener>();

export const terminalBus = {
  emit(event: TerminalEvent) {
    for (const l of listeners) l(event);
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
