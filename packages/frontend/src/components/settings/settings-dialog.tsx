import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useSettingsStore } from "@/stores/settings";
import type { SettingsSection } from "@/stores/settings";
import { SettingsNav } from "./settings-nav";
import { GeneralSection } from "./sections/general";
import { SystemPromptSection } from "./sections/system-prompt";
import { PersonalGeneralSection } from "./sections/personal-general";
import { McpServersSection } from "./sections/mcp-servers";

export function SettingsDialog() {
  const open = useSettingsStore((s) => s.open);
  const conversationId = useSettingsStore((s) => s.conversationId);
  const section = useSettingsStore((s) => s.section);
  const setSection = useSettingsStore((s) => s.setSection);
  const close = useSettingsStore((s) => s.close);

  const showProject = !!conversationId;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent
        showCloseButton={false}
        className="grid h-[680px] max-h-[88vh] grid-cols-[240px_1fr] gap-0 overflow-hidden p-0 min-w-[60%]"
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <SettingsNav active={section} onSelect={setSection} showProject={showProject} />
        <div className="overflow-hidden">
          <SectionRouter section={section} conversationId={conversationId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionRouter({
  section,
  conversationId,
}: {
  section: SettingsSection;
  conversationId: string | undefined;
}) {
  switch (section) {
    case "general":
      return conversationId ? <GeneralSection conversationId={conversationId} /> : null;
    case "system-prompt":
      return conversationId ? <SystemPromptSection conversationId={conversationId} /> : null;
    case "personal-general":
      return <PersonalGeneralSection />;
    case "mcp-servers":
      return <McpServersSection />;
  }
}
