import type { ReactNode } from "react";
import { X } from "lucide-react";
import { DialogClose } from "@/components/ui/dialog";

interface SectionShellProps {
  title: string;
  children: ReactNode;
}

export function SectionShell({ title, children }: SectionShellProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <DialogClose
          aria-label="Close"
          className="-mr-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-5 w-5" />
        </DialogClose>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
    </div>
  );
}
