import { Box, Text } from "ink";
import Spinner from "ink-spinner";

import { currentTheme } from "../themes/index";

const LOADING_MESSAGES = [
  "Working on it...",
  "Acting...",
  "Thinking...",
  "Processing...",
  "Working hard...",
  "Waaaaaait...",
  "Almost there...",
];

export function LoadingIndicator({ loading }: { loading: boolean }) {
  if (!loading) return null;
  return (
    <Box gap={1}>
      <Text color={currentTheme.colors.primary}>
        <Spinner type="dots" />
        <Text> {LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]}</Text>
      </Text>
    </Box>
  );
}
