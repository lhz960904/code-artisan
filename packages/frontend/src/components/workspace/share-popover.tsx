import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, Globe, Link2Off, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { conversationDetailOptions } from "@/api";
import { useShareConversation, useUnshareConversation } from "@/api/mutations";

interface SharePopoverProps {
  conversationId: string;
}

export function SharePopover({ conversationId }: SharePopoverProps) {
  const { data: conversation } = useQuery(conversationDetailOptions(conversationId));
  const share = useShareConversation(conversationId);
  const unshare = useUnshareConversation(conversationId);

  const hasDeploy = Boolean(conversation?.deployUrl);
  const slug = conversation?.shareSlug ?? null;

  if (!hasDeploy) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>
              <Button variant="outline" size="sm" className="gap-1.5 opacity-60" disabled>
                <Share2 className="h-3.5 w-3.5" />
                <span>Share</span>
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">Publish before sharing</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Share2 className="h-3.5 w-3.5" />
          <span>Share</span>
          {slug && <span aria-hidden className="ml-0.5 h-1.5 w-1.5 rounded-full bg-sky-500" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        {slug ? (
          <SharedShell
            slug={slug}
            unsharing={unshare.isPending}
            onUnshare={() => unshare.mutate()}
          />
        ) : (
          <UnsharedShell loading={share.isPending} onShare={() => share.mutate()} />
        )}
      </PopoverContent>
    </Popover>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-border px-4 py-3">
      <p className="text-sm font-semibold">{title}</p>
      {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function UnsharedShell({ loading, onShare }: { loading: boolean; onShare: () => void }) {
  return (
    <>
      <Header
        title="Share this app"
        subtitle="Anyone with the link can read the chat and run the deployed app. They cannot edit."
      />
      <div className="px-4 py-4">
        <Button className="w-full" onClick={onShare} disabled={loading}>
          {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Globe className="mr-1.5 h-3.5 w-3.5" />}
          {loading ? "Generating…" : "Generate share link"}
        </Button>
      </div>
    </>
  );
}

function SharedShell({
  slug,
  unsharing,
  onUnshare,
}: {
  slug: string;
  unsharing: boolean;
  onUnshare: () => void;
}) {
  const url = shareUrl(slug);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <Header title="Sharing" subtitle="Anyone with the link can view." />
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
          <Globe className="h-4 w-4 shrink-0 text-sky-500" />
          <span className="truncate text-sm">{url.replace(/^https?:\/\//, "")}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" size="sm" onClick={copy}>
            <Copy className="mr-1 h-3 w-3" />
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1 h-3 w-3" />
              Open
            </a>
          </Button>
          <Button variant="outline" size="sm" onClick={onUnshare} disabled={unsharing}>
            {unsharing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Link2Off className="mr-1 h-3 w-3" />}
            Unshare
          </Button>
        </div>
      </div>
    </>
  );
}

function shareUrl(slug: string) {
  if (typeof window === "undefined") return `/s/${slug}`;
  return `${window.location.origin}/s/${slug}`;
}
