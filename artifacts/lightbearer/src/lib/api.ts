/**
 * Tiny fetch wrapper that:
 *  • Prepends VITE_API_BASE_URL when set (GitHub Pages → Cloud Run)
 *  • Always sends credentials (session cookies)
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), { credentials: "include", ...init });
}
