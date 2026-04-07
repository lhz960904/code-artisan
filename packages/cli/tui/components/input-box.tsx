import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";

import { currentTheme } from "../themes/index";

const WELCOME_MESSAGES = [
  "To the moon!",
  "What do you want to build today?",
  "Hey, there!",
  "What's on your mind?",
  "Build, build, build!",
  "What's your plan today?",
  "Dream, code, repeat!",
  "Your next idea goes here...",
];

export function InputBox({
  disabled,
  onSubmit,
  onAbort,
}: {
  disabled?: boolean;
  onSubmit?: (text: string) => void;
  onAbort?: () => void;
}) {
  const [firstMessage, setFirstMessage] = useState(true);
  const [text, setText] = useState("");
  const handleChange = (text: string) => {
    if (disabled) return;
    setText(text);
  };
  useInput(
    (_input, key) => {
      if (key.escape || (key.ctrl && _input === "c")) {
        onAbort?.();
      }
    },
    { isActive: !!disabled },
  );

  const handleSubmit = () => {
    onSubmit?.(text);
    setText("");
    setFirstMessage(false);
  };
  return (
    <Box
      borderLeft={false}
      borderRight={false}
      borderStyle="single"
      borderColor={currentTheme.colors.borderColor}
      columnGap={1}
    >
      <Text>❯</Text>
      <TextInput
        showCursor={!disabled}
        placeholder={
          firstMessage
            ? WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)]
            : "Input anything to continue. Launch a new command or skill by typing `/`"
        }
        value={text}
        onChange={handleChange}
        onSubmit={handleSubmit}
      />
    </Box>
  );
}
