import { useWorkspace } from "../contexts/workspace-context";

export function PreviewPanel() {
  const { previewUrl } = useWorkspace();

  if (!previewUrl) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 items-center justify-between bg-[#161b22] px-3">
        <div className="flex items-center gap-2 text-xs text-[#8b949e]">
          <span className="truncate max-w-xs">{previewUrl}</span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[#58a6ff] hover:underline"
          >
            Open ↗
          </a>
        </div>
      </div>
      <iframe
        src={previewUrl}
        className="flex-1 bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title="Preview"
      />
    </div>
  );
}
