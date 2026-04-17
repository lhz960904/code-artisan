// import { createRoute, useNavigate } from "@tanstack/react-router";
// import { useState } from "react";
// import { useSuspenseQuery } from "@tanstack/react-query";
// import { Search, ExternalLink, Download, Trash2, Settings } from "lucide-react";
// import { mcpServersListOptions, useInstallMcpServer, useUninstallMcpServer, useUpdateMcpServer } from "@/api";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogFooter,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog";
// import { appShellRoute } from "@/pages/withSidbar";
// import type { McpServerListItem, McpEnvVar } from "@code-artisan/shared";

// export const mcpServersRoute = createRoute({
//   getParentRoute: () => appShellRoute,
//   path: "/mcp-servers",
//   validateSearch: (search: Record<string, unknown>) => ({
//     q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
//   }),
//   loaderDeps: ({ search }) => ({ q: search.q }),
//   loader: ({ context: { queryClient }, deps }) => queryClient.ensureQueryData(mcpServersListOptions(deps.q)),
//   pendingComponent: () => <div className="p-6 text-sm text-muted-foreground">Loading MCP servers...</div>,
//   component: McpServersPage,
// });

// export function McpServersPage() {
//   const navigate = useNavigate();
//   const { q } = mcpServersRoute.useSearch();
//   const { data: servers = [] } = useSuspenseQuery(mcpServersListOptions(q));

//   const [tab, setTab] = useState<"marketplace" | "installed">("marketplace");
//   const [installTarget, setInstallTarget] = useState<McpServerListItem | null>(null);
//   const [editTarget, setEditTarget] = useState<McpServerListItem | null>(null);

//   const displayServers = tab === "marketplace" ? servers : servers.filter((s) => s.installed);

//   return (
//     <div className="mx-auto max-w-4xl px-6 py-8">
//       <div className="mb-6">
//         <h1 className="text-2xl font-bold">MCP Servers</h1>
//         <p className="text-sm text-muted-foreground">
//           Manage Model Context Protocol servers for extended AI capabilities
//         </p>
//       </div>

//       <div className="mb-6 flex items-center gap-4 border-b border-border">
//         <button
//           onClick={() => setTab("marketplace")}
//           className={`pb-2 text-sm font-medium ${
//             tab === "marketplace"
//               ? "border-b-2 border-primary text-primary"
//               : "text-muted-foreground hover:text-foreground"
//           }`}
//         >
//           Marketplace
//         </button>
//         <button
//           onClick={() => setTab("installed")}
//           className={`pb-2 text-sm font-medium ${
//             tab === "installed"
//               ? "border-b-2 border-primary text-primary"
//               : "text-muted-foreground hover:text-foreground"
//           }`}
//         >
//           Installed
//         </button>
//       </div>

//       <div className="relative mb-6">
//         <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
//         <Input
//           placeholder="Search MCP servers..."
//           value={q ?? ""}
//           onChange={(e) =>
//             navigate({
//               to: "/mcp-servers",
//               search: { q: e.target.value.trim() || undefined },
//               replace: true,
//             })
//           }
//           className="pl-10"
//         />
//       </div>

//       {displayServers.length === 0 ? (
//         <p className="text-sm text-muted-foreground">
//           {tab === "installed" ? "No MCP servers installed yet." : "No servers found."}
//         </p>
//       ) : (
//         <div className="space-y-3">
//           {displayServers.map((server) => (
//             <ServerCard
//               key={server.id}
//               server={server}
//               onInstall={() => setInstallTarget(server)}
//               onEdit={() => setEditTarget(server)}
//             />
//           ))}
//         </div>
//       )}

//       {installTarget && <InstallDialog server={installTarget} onClose={() => setInstallTarget(null)} />}
//       {editTarget && <EditDialog server={editTarget} onClose={() => setEditTarget(null)} />}
//     </div>
//   );
// }

// function ServerCard({
//   server,
//   onInstall,
//   onEdit,
// }: {
//   server: McpServerListItem;
//   onInstall: () => void;
//   onEdit: () => void;
// }) {
//   const uninstall = useUninstallMcpServer();

//   return (
//     <div className="rounded-lg border border-border p-4">
//       <div className="flex items-start justify-between">
//         <div className="flex-1">
//           <div className="flex items-center gap-2">
//             <h3 className="font-semibold">{server.name}</h3>
//           </div>
//           <p className="text-xs text-muted-foreground">
//             by {server.author} · {server.category}
//           </p>
//           <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{server.description}</p>
//           <div className="mt-2 flex flex-wrap gap-1">
//             {server.tags.slice(0, 4).map((tag) => (
//               <span key={tag} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
//                 {tag}
//               </span>
//             ))}
//             {server.tags.length > 4 && (
//               <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
//                 +{server.tags.length - 4}
//               </span>
//             )}
//           </div>
//         </div>

//         <div className="ml-4 flex items-center gap-2">
//           <a
//             href={server.docUrl}
//             target="_blank"
//             rel="noopener noreferrer"
//             className="rounded-md p-2 text-muted-foreground hover:bg-accent"
//           >
//             <ExternalLink className="h-4 w-4" />
//           </a>

//           {server.installed ? (
//             <div className="flex gap-1">
//               {server.envVars.length > 0 && (
//                 <Button variant="outline" size="sm" onClick={onEdit}>
//                   <Settings className="mr-1 h-3.5 w-3.5" /> Edit
//                 </Button>
//               )}
//               <Button
//                 variant="outline"
//                 size="sm"
//                 onClick={() => uninstall.mutate(server.id)}
//                 disabled={uninstall.isPending}
//               >
//                 <Trash2 className="mr-1 h-3.5 w-3.5" /> Uninstall
//               </Button>
//             </div>
//           ) : (
//             <Button size="sm" onClick={onInstall}>
//               <Download className="mr-1 h-3.5 w-3.5" /> Install
//             </Button>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }

// function InstallDialog({ server, onClose }: { server: McpServerListItem; onClose: () => void }) {
//   const install = useInstallMcpServer();
//   const [envVars, setEnvVars] = useState<Record<string, string>>({});

//   const requiredVarsFilled = server.envVars.filter((v) => v.required).every((v) => envVars[v.name]?.trim());

//   const canInstall = server.envVars.length === 0 || requiredVarsFilled;

//   async function handleInstall() {
//     await install.mutateAsync({ serverId: server.id, envVars });
//     onClose();
//   }

//   return (
//     <Dialog open onOpenChange={onClose}>
//       <DialogContent className="sm:max-w-lg">
//         <DialogHeader>
//           <DialogTitle>{server.name}</DialogTitle>
//           <DialogDescription>
//             by {server.author} · {server.description}
//           </DialogDescription>
//         </DialogHeader>

//         <div className="space-y-4">
//           <a
//             href={server.docUrl}
//             target="_blank"
//             rel="noopener noreferrer"
//             className="flex items-center gap-1 text-sm text-primary hover:underline"
//           >
//             <ExternalLink className="h-3.5 w-3.5" /> View Documentation
//           </a>

//           {server.envVars.length > 0 && (
//             <div className="space-y-3">
//               <h4 className="text-sm font-semibold">Required Parameters</h4>
//               {server.envVars.map((envVar) => (
//                 <EnvVarInput
//                   key={envVar.name}
//                   envVar={envVar}
//                   value={envVars[envVar.name] || ""}
//                   onChange={(val) => setEnvVars((prev) => ({ ...prev, [envVar.name]: val }))}
//                 />
//               ))}
//             </div>
//           )}
//         </div>

//         <DialogFooter>
//           <Button variant="outline" onClick={onClose}>
//             Cancel
//           </Button>
//           <Button onClick={handleInstall} disabled={!canInstall || install.isPending}>
//             <Download className="mr-1 h-3.5 w-3.5" />
//             {install.isPending ? "Installing..." : "Install"}
//           </Button>
//         </DialogFooter>
//       </DialogContent>
//     </Dialog>
//   );
// }

// function EditDialog({ server, onClose }: { server: McpServerListItem; onClose: () => void }) {
//   const update = useUpdateMcpServer();
//   const [envVars, setEnvVars] = useState<Record<string, string>>({});

//   async function handleSave() {
//     await update.mutateAsync({ serverId: server.id, envVars });
//     onClose();
//   }

//   return (
//     <Dialog open onOpenChange={onClose}>
//       <DialogContent className="sm:max-w-lg">
//         <DialogHeader>
//           <DialogTitle>Edit {server.name}</DialogTitle>
//           <DialogDescription>Update configuration parameters</DialogDescription>
//         </DialogHeader>

//         <div className="space-y-3">
//           {server.envVars.map((envVar) => (
//             <EnvVarInput
//               key={envVar.name}
//               envVar={envVar}
//               value={envVars[envVar.name] || ""}
//               onChange={(val) => setEnvVars((prev) => ({ ...prev, [envVar.name]: val }))}
//             />
//           ))}
//         </div>

//         <DialogFooter>
//           <Button variant="outline" onClick={onClose}>
//             Cancel
//           </Button>
//           <Button onClick={handleSave} disabled={update.isPending}>
//             {update.isPending ? "Saving..." : "Save"}
//           </Button>
//         </DialogFooter>
//       </DialogContent>
//     </Dialog>
//   );
// }

// function EnvVarInput({
//   envVar,
//   value,
//   onChange,
// }: {
//   envVar: McpEnvVar;
//   value: string;
//   onChange: (val: string) => void;
// }) {
//   return (
//     <div>
//       <label className="text-sm font-medium">
//         {envVar.label}
//         {envVar.required && <span className="ml-0.5 text-destructive">*</span>}
//       </label>
//       <Input
//         placeholder={envVar.placeholder}
//         value={value}
//         onChange={(e) => onChange(e.target.value)}
//         className="mt-1"
//       />
//       <p className="mt-1 text-xs text-muted-foreground">{envVar.description}</p>
//     </div>
//   );
// }
