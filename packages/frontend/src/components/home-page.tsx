import { ConversationList } from "./conversation-list";

export function HomePage() {
  return (
    <div className="flex h-full items-start justify-center pt-16">
      <div className="w-full max-w-lg p-4">
        <h1 className="mb-8 text-center text-2xl font-semibold text-[#58a6ff]">
          Web AI Coding Agent
        </h1>
        <ConversationList />
      </div>
    </div>
  );
}
