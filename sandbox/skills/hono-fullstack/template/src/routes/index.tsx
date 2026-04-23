import { useMutation } from "@tanstack/react-query";
import { Minus, Plus, RotateCcw, Sparkles, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCounter } from "@/store/use-counter";

interface HelloResponse {
  message: string;
  timestamp: string;
}

const STACK = [
  "Vite",
  "React",
  "TypeScript",
  "Tailwind",
  "shadcn/ui",
  "TanStack Router",
  "TanStack Query",
  "Zustand",
  "Hono",
  "Bun",
];

export function LandingPage() {
  const { count, increment, decrement, reset } = useCounter();

  const hello = useMutation({
    mutationFn: async (): Promise<HelloResponse> => {
      const res = await fetch("/api/hello");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99, 102, 241, 0.18), transparent 70%), radial-gradient(ellipse 60% 40% at 80% 110%, rgba(236, 72, 153, 0.12), transparent 70%)",
        }}
      />

      <main className="container mx-auto flex max-w-5xl flex-col gap-12 px-6 py-20">
        <header className="flex flex-col items-center gap-6 text-center">
          <Badge variant="secondary" className="gap-1.5">
            <Sparkles className="h-3 w-3" />
            Hono Fullstack Starter
          </Badge>
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
            Ship a full-stack app
            <br />
            <span className="bg-gradient-to-r from-indigo-500 to-pink-500 bg-clip-text text-transparent">
              in one command.
            </span>
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            One dev server, one port, zero config drift. Vite + React on the
            front, Hono + Bun on the back, glued together by TanStack Router,
            TanStack Query, Zustand, and shadcn/ui.
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {STACK.map((name) => (
              <Badge key={name} variant="outline" className="font-mono">
                {name}
              </Badge>
            ))}
          </div>
        </header>

        <section className="grid gap-6 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-indigo-500" />
                API demo
              </CardTitle>
              <CardDescription>
                Click to hit <code className="font-mono">/api/hello</code> —
                TanStack Query calls your Hono route on the same port.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={() => hello.mutate()}
                disabled={hello.isPending}
                className="w-full"
              >
                {hello.isPending ? "Calling..." : "Try it"}
              </Button>
              {hello.data && (
                <div className="rounded-md border bg-muted/40 p-3 text-sm">
                  <p className="font-medium">{hello.data.message}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {hello.data.timestamp}
                  </p>
                </div>
              )}
              {hello.error && (
                <p className="text-sm text-destructive">
                  {(hello.error as Error).message}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Zustand counter</CardTitle>
              <CardDescription>
                Local state, no provider, no context. Value:
                <span className="ml-1.5 font-mono text-foreground">{count}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button variant="outline" size="icon" onClick={decrement}>
                <Minus />
              </Button>
              <Button variant="outline" size="icon" onClick={increment}>
                <Plus />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={reset}
                disabled={count === 0}
              >
                <RotateCcw />
              </Button>
            </CardContent>
          </Card>
        </section>

        <footer className="pt-8 text-center text-xs text-muted-foreground">
          Edit <code className="font-mono">src/routes/index.tsx</code> to start
          building.
        </footer>
      </main>
    </div>
  );
}
