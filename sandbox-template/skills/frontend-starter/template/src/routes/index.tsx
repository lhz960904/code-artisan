import { ArrowRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STACK = [
  "Vite",
  "React",
  "TypeScript",
  "Tailwind",
  "shadcn/ui",
  "TanStack Router",
  "TanStack Query",
  "Zustand",
];

export function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99, 102, 241, 0.18), transparent 70%), radial-gradient(ellipse 60% 40% at 80% 110%, rgba(236, 72, 153, 0.12), transparent 70%)",
        }}
      />
      <main className="container mx-auto flex max-w-3xl flex-col gap-12 px-6 py-20">
        <header className="flex flex-col items-center gap-6 text-center">
          <Badge variant="secondary" className="gap-1.5">
            <Sparkles className="h-3 w-3" />
            Frontend Starter
          </Badge>
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
            Tell me what to build.
            <br />
            <span className="bg-gradient-to-r from-indigo-500 to-pink-500 bg-clip-text text-transparent">
              I'll write it for you.
            </span>
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Vite + React with the modern toolkit pre-wired. Open the chat panel
            and describe the app you want — landing page, dashboard, todo list,
            anything.
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {STACK.map((name) => (
              <Badge key={name} variant="outline" className="font-mono">
                {name}
              </Badge>
            ))}
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-indigo-500" />
              Ready to start
            </CardTitle>
            <CardDescription>
              Edit <code className="font-mono">src/routes/index.tsx</code> to
              replace this page, or just describe what you want in chat.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Routes live in <code className="font-mono">src/router.tsx</code> · UI
            primitives in <code className="font-mono">src/components/ui/</code> ·
            path alias <code className="font-mono">@/</code> →{" "}
            <code className="font-mono">src/</code>.
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
