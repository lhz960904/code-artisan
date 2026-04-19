import { GripVerticalIcon } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

type ResizablePanelGroupProps = ResizablePrimitive.GroupProps & {
  panelIds?: string[]
}

function ResizablePanelGroup({ panelIds, ...props }: ResizablePanelGroupProps) {
  if (props.id) return <PersistedGroup {...props} id={props.id} panelIds={panelIds} />
  return <PlainGroup {...props} />
}

function PlainGroup({ className, ...props }: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full aria-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function PersistedGroup({
  id,
  className,
  panelIds,
  ...props
}: ResizablePrimitive.GroupProps & { id: string | number; panelIds?: string[] }) {
  const { defaultLayout, onLayoutChanged } = ResizablePrimitive.useDefaultLayout({
    id: String(id),
    panelIds,
  })
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      id={id}
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className={cn(
        "flex h-full w-full aria-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "relative z-10 w-0 focus-visible:outline-hidden after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2 after:bg-transparent after:transition-colors after:content-[''] aria-[orientation=horizontal]:h-0 aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:top-1/2 aria-[orientation=horizontal]:after:h-2 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 hover:after:bg-border/50 data-[separator=active]:after:bg-border/50",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-xs border bg-border">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </ResizablePrimitive.Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
