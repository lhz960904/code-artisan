const API_BASE = "/api";

export interface ConversationResponse {
  id: string;
  user_id: string;
  title: string | null;
  mode: string;
  sandbox_id: string | null;
  deploy_url: string | null;
  created_at: string;
  updated_at: string;
}

export async function createConversation(title?: string): Promise<ConversationResponse> {
  const res = await fetch(`${API_BASE}/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function listConversations(): Promise<ConversationResponse[]> {
  const res = await fetch(`${API_BASE}/conversations`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getConversation(id: string): Promise<ConversationResponse> {
  const res = await fetch(`${API_BASE}/conversations/${id}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function sendMessage(conversationId: string, content: string): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function updateConversation(
  id: string,
  updates: { title?: string; mode?: string },
): Promise<ConversationResponse> {
  const res = await fetch(`${API_BASE}/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
