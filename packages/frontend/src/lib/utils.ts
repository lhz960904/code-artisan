import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Resolves an attachment fileId to a fetchable URL. Pass-through for absolute
 * URLs (used by debug fixtures + any external attachments); otherwise builds
 * the Supabase Storage public URL.
 */
export function resolveAttachmentUrl(fileId: string): string {
  if (fileId.startsWith("http")) return fileId;
  const baseUrl = import.meta.env.SUPABASE_URL as string;
  return `${baseUrl}/storage/v1/object/public/attachments/${fileId}`;
}
