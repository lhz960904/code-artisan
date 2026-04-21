import { useMemo, useState } from "react";
import { CaseSensitive, Regex } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace";
import { SANDBOX_WORKSPACE_ROOT, SANDBOX_IGNORED_DIRS } from "@code-artisan/shared";

const IGNORED_SET = new Set<string>(SANDBOX_IGNORED_DIRS);
const MAX_CONTENT_MATCHES_PER_FILE = 20;
const MAX_LINE_PREVIEW = 200;

interface ContentMatch {
  line: number;
  text: string;
}

interface SearchResult {
  path: string;
  relPath: string;
  nameMatches: boolean;
  contentMatches: ContentMatch[];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildMatcher(query: string, caseSensitive: boolean, useRegex: boolean):
  | ((s: string) => boolean)
  | { error: string } {
  if (useRegex) {
    try {
      const re = new RegExp(query, caseSensitive ? "" : "i");
      return (s: string) => re.test(s);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Invalid regex" };
    }
  }
  if (caseSensitive) {
    return (s: string) => s.includes(query);
  }
  const lowered = query.toLowerCase();
  return (s: string) => s.toLowerCase().includes(lowered);
}

interface HighlightProps {
  text: string;
  query: string;
  caseSensitive: boolean;
  useRegex: boolean;
}

function Highlight({ text, query, caseSensitive, useRegex }: HighlightProps) {
  if (!query) return <>{text}</>;

  let re: RegExp;
  try {
    re = new RegExp(useRegex ? query : escapeRegex(query), caseSensitive ? "g" : "gi");
  } catch {
    return <>{text}</>;
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <mark key={key++} className="rounded-sm bg-yellow-400/40 text-foreground">
        {match[0]}
      </mark>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }
  return <>{parts}</>;
}

function searchFiles(
  files: Map<string, string>,
  matcher: (s: string) => boolean,
): SearchResult[] {
  const prefix = SANDBOX_WORKSPACE_ROOT + "/";
  const out: SearchResult[] = [];

  for (const [path, content] of files) {
    if (!path.startsWith(prefix)) continue;
    const relPath = path.slice(prefix.length);
    if (!relPath) continue;
    if (relPath.split("/").some((p) => IGNORED_SET.has(p))) continue;

    const nameMatches = matcher(relPath);
    const lines = content.split("\n");
    const contentMatches: ContentMatch[] = [];
    for (let i = 0; i < lines.length && contentMatches.length < MAX_CONTENT_MATCHES_PER_FILE; i++) {
      if (matcher(lines[i])) {
        contentMatches.push({ line: i + 1, text: lines[i].trim().slice(0, MAX_LINE_PREVIEW) });
      }
    }
    if (nameMatches || contentMatches.length > 0) {
      out.push({ path, relPath, nameMatches, contentMatches });
    }
  }

  out.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return out;
}

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}

function ToggleButton({ active, onClick, title, children }: ToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function FileSearch() {
  const { files, openFile, openFileAt } = useWorkspaceStore(
    useShallow((s) => ({ files: s.files, openFile: s.openFile, openFileAt: s.openFileAt })),
  );
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);

  const { results, error } = useMemo(() => {
    if (!query) return { results: [] as SearchResult[], error: null as string | null };
    const matcher = buildMatcher(query, caseSensitive, useRegex);
    if (typeof matcher !== "function") return { results: [], error: matcher.error };
    return { results: searchFiles(files, matcher), error: null };
  }, [query, caseSensitive, useRegex, files]);

  const totalMatches = results.reduce(
    (acc, r) => acc + r.contentMatches.length + (r.nameMatches ? 1 : 0),
    0,
  );

  return (
    <div className="flex h-full min-w-0 flex-col text-sm">
      <div className="p-2">
        <div className="flex min-w-0 items-center gap-1 rounded-md border border-input bg-background px-2 focus-within:ring-1 focus-within:ring-ring">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <ToggleButton
            active={caseSensitive}
            onClick={() => setCaseSensitive((v) => !v)}
            title="Match case"
          >
            <CaseSensitive className="h-3.5 w-3.5" />
          </ToggleButton>
          <ToggleButton
            active={useRegex}
            onClick={() => setUseRegex((v) => !v)}
            title="Use regular expression"
          >
            <Regex className="h-3.5 w-3.5" />
          </ToggleButton>
        </div>
        {error && (
          <div className="mt-1.5 px-1 text-xs text-destructive">{error}</div>
        )}
        {!error && query && (
          <div className="mt-1.5 px-1 text-xs text-muted-foreground">
            {results.length === 0
              ? "No results"
              : `${totalMatches} match${totalMatches === 1 ? "" : "es"} in ${results.length} file${results.length === 1 ? "" : "s"}`}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-1 pb-2">
        {results.map((result) => (
          <div key={result.path} className="mb-1">
            <button
              onClick={() => openFile(result.path)}
              className="flex w-full items-center gap-1 rounded px-2 py-0.5 text-left font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
              title={result.relPath}
            >
              <span className="truncate">
                <Highlight
                  text={result.relPath}
                  query={query}
                  caseSensitive={caseSensitive}
                  useRegex={useRegex}
                />
              </span>
              {result.contentMatches.length > 0 && (
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                  {result.contentMatches.length}
                </span>
              )}
            </button>
            {result.contentMatches.map((match) => (
              <button
                key={match.line}
                onClick={() => openFileAt(result.path, match.line)}
                className="flex w-full items-baseline gap-2 rounded px-2 py-0.5 pl-5 text-left text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <span className="shrink-0 text-[11px] opacity-60 tabular-nums">{match.line}</span>
                <span className="truncate font-mono">
                  {match.text ? (
                    <Highlight
                      text={match.text}
                      query={query}
                      caseSensitive={caseSensitive}
                      useRegex={useRegex}
                    />
                  ) : (
                    " "
                  )}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
