import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, TestTube, Plus, KeyRound, ShieldCheck, ToggleLeft, ToggleRight, Loader2 } from "lucide-react";
import { apiUrl } from "@/lib/api";

interface GroqKeyEntry {
  id: number;
  label: string;
  keyMasked: string;
  isActive: boolean;
  testStatus: string | null;
  lastTestedAt: string | null;
  createdAt: string;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(body.error ?? "Request failed");
  }
  return res.json();
}

export default function AdminPage() {
  const { broadcaster } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [keys, setKeys] = useState<GroqKeyEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  if (!broadcaster) {
    navigate("/login");
    return null;
  }

  if (!broadcaster.isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldCheck className="w-16 h-16 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Admin Access Required</h1>
        <p className="text-muted-foreground">Your account does not have admin privileges.</p>
        <Button onClick={() => navigate("/")}>Go Home</Button>
      </div>
    );
  }

  async function loadKeys() {
    setLoading(true);
    try {
      const data = await apiFetch("/api/admin/groq-keys");
      setKeys(data);
      setLoaded(true);
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (!loaded && !loading) loadKeys();

  async function handleAdd() {
    if (!newLabel.trim() || !newKey.trim()) {
      toast({ title: "Missing fields", description: "Enter both a label and API key", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const created = await apiFetch("/api/admin/groq-keys", {
        method: "POST",
        body: JSON.stringify({ label: newLabel.trim(), keyValue: newKey.trim() }),
      });
      setKeys((prev) => [...prev, created]);
      setNewLabel("");
      setNewKey("");
      toast({ title: "Key added", description: `"${created.label}" saved successfully.` });
    } catch (e) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }

  async function handleTest(id: number) {
    setTestingId(id);
    try {
      const result = await apiFetch(`/api/admin/groq-keys/${id}/test`, { method: "POST" });
      setKeys((prev) =>
        prev.map((k) => (k.id === id ? { ...k, testStatus: result.testStatus, lastTestedAt: result.lastTestedAt } : k))
      );
      if (result.testStatus === "ok") {
        toast({ title: "Key works!", description: "GROQ API key is valid and active." });
      } else {
        toast({ title: "Key failed", description: result.error ?? "Key is invalid.", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Test error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setTestingId(null);
    }
  }

  async function handleToggle(entry: GroqKeyEntry) {
    try {
      const updated = await apiFetch(`/api/admin/groq-keys/${entry.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !entry.isActive }),
      });
      setKeys((prev) => prev.map((k) => (k.id === entry.id ? { ...k, isActive: updated.isActive } : k)));
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await apiFetch(`/api/admin/groq-keys/${id}`, { method: "DELETE" });
      setKeys((prev) => prev.filter((k) => k.id !== id));
      toast({ title: "Deleted", description: "API key removed." });
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  const statusBadge = (s: string | null) => {
    if (!s) return null;
    return s === "ok"
      ? <Badge className="bg-green-600 text-white text-xs">✓ Valid</Badge>
      : <Badge variant="destructive" className="text-xs">✗ Failed</Badge>;
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-8 h-8 text-amber-500" />
        <div>
          <h1 className="text-3xl font-bold">Admin Panel</h1>
          <p className="text-muted-foreground text-sm">Manage GROQ API key pool for AI transcription</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" />
            GROQ API Key Pool
          </CardTitle>
          <CardDescription>
            Add up to 5 GROQ API keys. The AI transcription service picks one randomly from active keys.
            Keys are stored securely and never shown in full after saving.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading && !loaded ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading keys…
            </div>
          ) : keys.length === 0 ? (
            <p className="text-muted-foreground text-sm py-2">No API keys added yet. Add your first key below.</p>
          ) : (
            <div className="space-y-3">
              {keys.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{entry.label}</span>
                      {statusBadge(entry.testStatus)}
                      {!entry.isActive && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">Disabled</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{entry.keyMasked}</p>
                    {entry.lastTestedAt && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Tested {new Date(entry.lastTestedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggle(entry)}
                      title={entry.isActive ? "Disable key" : "Enable key"}
                    >
                      {entry.isActive
                        ? <ToggleRight className="w-4 h-4 text-green-500" />
                        : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTest(entry.id)}
                      disabled={testingId === entry.id}
                      title="Test key"
                    >
                      {testingId === entry.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <TestTube className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(entry.id)}
                      disabled={deletingId === entry.id}
                      className="text-destructive hover:text-destructive"
                      title="Delete key"
                    >
                      {deletingId === entry.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {keys.length < 5 && (
            <div className="border-t pt-5 space-y-3">
              <p className="text-sm font-medium">Add New Key ({keys.length}/5 used)</p>
              <div className="flex gap-2">
                <Input
                  placeholder="Label (e.g. Key 1, Main Key)"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="w-36 shrink-0"
                />
                <Input
                  placeholder="gsk_••••••••••••••••••••••••••"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  type="password"
                  className="flex-1 font-mono text-sm"
                />
                <Button onClick={handleAdd} disabled={adding} className="shrink-0">
                  {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span className="ml-1 hidden sm:inline">Save</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Get API keys at <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="underline">console.groq.com</a>.
                Keys must start with <code className="bg-muted px-1 rounded">gsk_</code>.
              </p>
            </div>
          )}

          {keys.length >= 5 && (
            <p className="text-sm text-amber-600 font-medium border-t pt-4">
              Maximum of 5 keys reached. Delete one to add a new key.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
