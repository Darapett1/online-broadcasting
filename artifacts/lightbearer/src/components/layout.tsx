import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { Mic, Radio, User, LogOut, Home, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const { broadcaster, logout } = useAuth();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center">
          <Link href="/" className="flex items-center gap-2 mr-6 text-primary">
            <Radio className="h-6 w-6" />
            <span className="font-bold text-xl tracking-tight hidden sm:inline-block font-sans">The Lightbearer</span>
          </Link>
          
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="/" className="transition-colors hover:text-primary flex items-center gap-2">
              <Home className="h-4 w-4" /> <span className="hidden sm:inline-block">Home</span>
            </Link>
            <Link href="/browse" className="transition-colors hover:text-primary flex items-center gap-2">
              <Search className="h-4 w-4" /> <span className="hidden sm:inline-block">Browse</span>
            </Link>
            {broadcaster && (
              <Link href="/studio" className="transition-colors text-primary hover:text-primary/80 flex items-center gap-2">
                <Mic className="h-4 w-4" /> <span className="hidden sm:inline-block">Studio</span>
              </Link>
            )}
          </nav>
          
          <div className="ml-auto flex items-center space-x-4">
            {broadcaster ? (
              <div className="flex items-center gap-4">
                <Link href="/profile" className="flex items-center gap-2 hover:text-primary transition-colors">
                  <div className="h-8 w-8 rounded-full overflow-hidden bg-muted border border-border">
                    {broadcaster.avatarUrl ? (
                      <img src={broadcaster.avatarUrl} alt={broadcaster.name} className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-full w-full p-1.5 text-muted-foreground" />
                    )}
                  </div>
                  <span className="hidden sm:inline-block text-sm">{broadcaster.name}</span>
                </Link>
                <Button variant="ghost" size="icon" onClick={() => logout()} title="Logout">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login">
                  <Button variant="ghost" className="hidden sm:flex">Log in</Button>
                </Link>
                <Link href="/register">
                  <Button>Sign up</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
