import { createFileRoute } from "@tanstack/react-router";
import { ChatPanel } from "../components/chat-panel";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-2xl p-4">
        <h1 className="mb-8 text-center text-2xl font-semibold text-[#58a6ff]">
          Web AI Coding Agent
        </h1>
        <ChatPanel />
      </div>
    </div>
  );
}
