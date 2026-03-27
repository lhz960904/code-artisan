const API_BASE = "/api";

export async function sendMessage(content: string): Promise<{
  conversationId: string;
  events: Array<{ type: string; data: Record<string, unknown> }>;
}> {
  const res = await fetch(`${API_BASE}/conversations/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
