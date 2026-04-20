import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

/* ------------------------------------------------------------------ */
/*  Code                                                              */
/* ------------------------------------------------------------------ */

function InlineCode({ children, ...props }: React.ComponentPropsWithoutRef<"code">) {
  return (
    <code
      className="rounded-sm bg-muted px-1 py-0.5 font-mono text-xs text-secondary-foreground"
      {...props}
    >
      {children}
    </code>
  );
}

/** Strip text-shadow from oneDark tokens to avoid the "ghost / double text" look. */
const codeTheme = Object.fromEntries(
  Object.entries(oneDark).map(([key, value]) => [
    key,
    typeof value === "object" && value !== null
      ? { ...value, textShadow: "none" }
      : value,
  ]),
) as typeof oneDark;

function CodeBlock({ language, children }: { language: string; children: string }) {
  return (
    <SyntaxHighlighter
      style={codeTheme}
      language={language}
      PreTag="div"
      customStyle={{
        margin: "0.5rem 0",
        borderRadius: "var(--radius-md)",
        fontSize: "0.75rem",
        fontFamily: "var(--font-mono)",
        background: "var(--color-secondary)",
        border: "1px solid var(--color-border)",
      }}
      codeTagProps={{
        style: { fontFamily: "inherit", background: "transparent" },
      }}
    >
      {children}
    </SyntaxHighlighter>
  );
}

/* ------------------------------------------------------------------ */
/*  Table                                                             */
/* ------------------------------------------------------------------ */

function Table({ children }: { children?: ReactNode }) {
  return (
    <div className="my-2 overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

function TableHead({ children }: { children?: ReactNode }) {
  return <thead className="bg-muted">{children}</thead>;
}

function TableHeader({ children }: { children?: ReactNode }) {
  return (
    <th className="border border-border px-3 py-1.5 text-left font-semibold text-foreground">
      {children}
    </th>
  );
}

function TableCell({ children }: { children?: ReactNode }) {
  return (
    <td className="border border-border px-3 py-1.5 text-foreground">
      {children}
    </td>
  );
}

/* ------------------------------------------------------------------ */
/*  MarkdownRenderer                                                  */
/* ------------------------------------------------------------------ */

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const text = String(children).replace(/\n$/, "");
          const isMultiline = text.includes("\n");
          if (!match && !isMultiline) return <InlineCode {...props}>{children}</InlineCode>;
          return (
            <CodeBlock language={match?.[1] ?? "text"}>
              {text}
            </CodeBlock>
          );
        },
        p({ children }) {
          return <p className="mb-2 last:mb-0">{children}</p>;
        },
        ul({ children }) {
          return <ul className="mb-2 list-disc pl-4">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="mb-2 list-decimal pl-4">{children}</ol>;
        },
        a({ href, children }) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">
              {children}
            </a>
          );
        },
        table: Table,
        thead: TableHead,
        th: TableHeader,
        td: TableCell,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
