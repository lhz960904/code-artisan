import { Text } from "ink";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";

marked.setOptions({
  renderer: new TerminalRenderer() as never,
});

export function Markdown({ children }: { children: string }) {
  return <Text>{marked(children)}</Text>;
}
