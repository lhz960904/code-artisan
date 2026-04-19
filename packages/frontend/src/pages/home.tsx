import { createRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { rootRoute } from "./layout/root";
import { HomeHeader } from "@/components/layout/home-header";
import { Sender } from "@/components/chat/sender";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useStartConversation } from "@/hooks/use-start-conversation";

const TYPING_PREFIX = "Let's build ";
const TYPING_SUFFIXES = [
  "a landing page for a coffee startup",
  "a dashboard for SaaS metrics",
  "a dark-mode pricing page",
  "a portfolio with an interactive hero",
  "a tiny AI chat UI with a sidebar",
];

function useTypingPlaceholder(prefix: string, suffixes: string[]) {
  const [text, setText] = useState(suffixes[0] ?? "");
  const stateRef = useRef({
    idx: 0,
    chars: suffixes[0]?.length ?? 0,
    phase: "pausing" as "typing" | "pausing" | "deleting",
  });

  useEffect(() => {
    if (suffixes.length === 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const s = stateRef.current;
      const current = suffixes[s.idx % suffixes.length];
      if (s.phase === "typing") {
        if (s.chars >= current.length) {
          s.phase = "pausing";
          timer = setTimeout(tick, 1600);
        } else {
          s.chars += 1;
          setText(current.slice(0, s.chars));
          timer = setTimeout(tick, 45);
        }
      } else if (s.phase === "pausing") {
        s.phase = "deleting";
        timer = setTimeout(tick, 0);
      } else {
        if (s.chars <= 0) {
          s.idx = (s.idx + 1) % suffixes.length;
          s.phase = "typing";
          timer = setTimeout(tick, 250);
        } else {
          s.chars -= 1;
          setText(current.slice(0, s.chars));
          timer = setTimeout(tick, 25);
        }
      }
    };
    timer = setTimeout(tick, 1200);
    return () => clearTimeout(timer);
  }, [suffixes]);

  return prefix + text;
}

export const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});


export function HomePage() {
  const fileUpload = useFileUpload();
  const placeholder = useTypingPlaceholder(TYPING_PREFIX, TYPING_SUFFIXES);
  const { start, busy } = useStartConversation();

  const handleSubmit = (content: string) =>
    start(content, fileUpload.attachments);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <HomeHeader />
      <main>
        <section className="relative mx-auto max-w-[800px] px-6 pb-16 pt-24 text-center md:pt-32">
          <div className="motion-safe:animate-[fadeIn_0.5s_ease-out_both] inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 font-display text-xs text-muted-foreground shadow-[0_0_0_1px_hsl(var(--border))]">
            <span className="size-1.5 rounded-full bg-success" aria-hidden />
            <strong>Opus 4.7</strong> Now Supported !
          </div>

          <h1 className="motion-safe:animate-[fadeIn_0.6s_ease-out_0.05s_both] mt-6 font-display text-[40px] font-medium leading-[1.05] tracking-[-0.033em] text-foreground md:text-[56px] md:tracking-[-0.033em]">
            Build software by{" "}
            <em className="font-body font-medium italic text-primary">describing it.</em>
          </h1>

          <p className="motion-safe:animate-[fadeIn_0.6s_ease-out_0.1s_both] mx-auto mt-4 max-w-[520px] font-body text-[16px] leading-[1.5] text-muted-foreground md:text-[18px]">
            web coding agent that help you ship web application quickly !
          </p>

          <div className="motion-safe:animate-[fadeIn_0.6s_ease-out_0.15s_both] mx-auto mt-10 max-w-[680px]">
            <Sender
              size="large"
              submitLabel="Start"
              onSubmit={handleSubmit}
              busy={busy}
              placeholder={placeholder}
              files={fileUpload.files}
              onAddFiles={fileUpload.addFiles}
              onRemoveFile={fileUpload.removeFile}
              isUploading={fileUpload.isUploading}
            />
          </div>

        </section>

      </main>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}