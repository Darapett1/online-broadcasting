import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Mic, Radio, User, LogOut, Home, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const { broadcaster, logout } = useAuth();
  const [location] = useLocation();

  const isActive = (path: string) => location === path;

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-sidebar border-r border-sidebar-border fixed h-[100dvh] z-50">
        <div className="p-6 flex items-center gap-3 text-primary">
          <Radio className="h-8 w-8" />
          <span className="font-bold text-xl tracking-wider font-sans uppercase">Lightbearer</span>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          <Link href="/" className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors font-medium ${isActive("/") ? "bg-sidebar-accent text-primary" : "text-sidebar-foreground hover:text-primary"}`}>
            <Home className="h-5 w-5" />
            <span>Home</span>
          </Link>
          <Link href="/browse" className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors font-medium ${isActive("/browse") ? "bg-sidebar-accent text-primary" : "text-sidebar-foreground hover:text-primary"}`}>
            <Search className="h-5 w-5" />
            <span>Browse</span>
          </Link>
          {broadcaster && (
            <Link href="/studio" className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors font-medium ${isActive("/studio") ? "bg-sidebar-accent text-primary" : "text-sidebar-foreground hover:text-primary"}`}>
              <Mic className="h-5 w-5" />
              <span>Studio</span>
            </Link>
          )}
          {broadcaster?.isAdmin && (
            <Link href="/admin" className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors font-medium ${isActive("/admin") ? "bg-sidebar-accent text-amber-500" : "text-amber-500/70 hover:text-amber-500"}`}>
              <ShieldCheck className="h-5 w-5" />
              <span>Admin</span>
            </Link>
          )}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          {broadcaster ? (
            <div className="flex items-center justify-between">
              <Link href="/profile" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <div className="h-10 w-10 rounded-full overflow-hidden bg-sidebar-accent border border-sidebar-border flex-shrink-0">
                  {broadcaster.avatarUrl ? (
                    <img src={broadcaster.avatarUrl} alt={broadcaster.name} className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-full w-full p-2 text-sidebar-foreground" />
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold truncate text-sidebar-foreground">{broadcaster.name}</span>
                  <span className="text-xs text-muted-foreground truncate">@{broadcaster.username}</span>
                </div>
              </Link>
              <Button variant="ghost" size="icon" className="flex-shrink-0 text-sidebar-foreground hover:text-primary hover:bg-sidebar-accent ml-2" onClick={() => logout()} title="Logout">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Link href="/login" className="w-full">
                <Button variant="outline" className="w-full border-sidebar-border bg-sidebar hover:bg-sidebar-accent hover:text-primary">Log in</Button>
              </Link>
              <Link href="/register" className="w-full">
                <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold">Sign up</Button>
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-60 pb-16 md:pb-0 min-h-[100dvh] overflow-y-auto relative">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-sidebar border-t border-sidebar-border z-50 flex items-center justify-around px-2">
        <Link href="/" className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive("/") ? "text-primary" : "text-sidebar-foreground"}`}>
          <Home className="h-5 w-5" />
          <span className="text-[10px] font-medium">Home</span>
        </Link>
        <Link href="/browse" className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive("/browse") ? "text-primary" : "text-sidebar-foreground"}`}>
          <Search className="h-5 w-5" />
          <span className="text-[10px] font-medium">Browse</span>
        </Link>
        {broadcaster && (
          <Link href="/studio" className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive("/studio") ? "text-primary" : "text-sidebar-foreground"}`}>
            <Mic className="h-5 w-5" />
            <span className="text-[10px] font-medium">Studio</span>
          </Link>
        )}
        <Link href={broadcaster ? "/profile" : "/login"} className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive("/profile") || isActive("/login") ? "text-primary" : "text-sidebar-foreground"}`}>
          <User className="h-5 w-5" />
          <span className="text-[10px] font-medium">{broadcaster ? "Profile" : "Login"}</span>
        </Link>
      </div>
    </div>
  );
}
