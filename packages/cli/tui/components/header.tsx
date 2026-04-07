import { Box, Text } from "ink";

import { currentTheme } from "../themes/index";

export function Header() {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
  return (
    <Box columnGap={2}>
      <Logo />
      <Box flexDirection="column">
        <Box columnGap={1}>
          <Text color={currentTheme.colors.primary}>Code Artisan</Text>
          <Text color={currentTheme.colors.secondaryText}>v0.1.0</Text>
        </Box>
        <Box>
          <Text color={currentTheme.colors.secondaryText}>{model}</Text>
        </Box>
        <Box columnGap={1}>
          <Text color={currentTheme.colors.secondaryText}>{process.cwd()}</Text>
        </Box>
      </Box>
    </Box>
  );
}

export function Logo({ color = currentTheme.colors.primary }: { color?: string }) {
  return (
    <Box flexDirection="column">
      <Text color={color}>{" ".repeat(2)}▋▋ ▋▋</Text>
      <Text color={color}> ▐▛███▜▌</Text>
      <Text color={color}>▝▜█████▛▘</Text>
    </Box>
  );
}
