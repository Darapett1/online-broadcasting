/**
 * Build a WebSocket URL for the given path.
 *
 * On Replit (same origin) → wss://your-repl.replit.app/ws/...
 * On GitHub Pages         → wss://your-api.run.app/ws/...  (from VITE_API_BASE_URL)
 */
export function wsUrl(path: string): string {
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "");
  if (apiBase) {
    const wsBase = apiBase.replace(/^https/, "wss").replace(/^http/, "ws");
    return `${wsBase}${path}`;
  }
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}
