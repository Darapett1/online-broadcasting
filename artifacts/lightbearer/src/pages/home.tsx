import { useGetPlatformStats, useListBroadcasts } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Radio, Users, Mic2, PlayCircle, Activity } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  const { data: stats } = useGetPlatformStats();
  const { data: liveBroadcasts } = useListBroadcasts({ query: { queryKey: ["broadcasts", { live: true }] }, request: { query: { live: true } } } as any);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero */}
      <section className="relative py-24 md:py-32 lg:py-40 overflow-hidden bg-background">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background pointer-events-none"></div>
        <div className="container relative z-10 text-center flex flex-col items-center">
          <Badge variant="outline" className="border-primary/50 text-primary mb-6 px-4 py-1 text-sm bg-primary/10">
            <Activity className="w-4 h-4 mr-2 animate-pulse" /> Live Now: {stats?.liveBroadcasts || 0} Ministries
          </Badge>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 max-w-4xl text-foreground font-sans">
            Proclaim the Word to the <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Ends of the Earth</span>
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-10 max-w-2xl">
            The Lightbearer is a professional audio broadcasting platform for gospel ministries, preachers, and worship leaders.
          </p>
          <div className="flex gap-4">
            <Link href="/browse" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 py-2">
              <PlayCircle className="w-5 h-5 mr-2" /> Listen Now
            </Link>
            <Link href="/register" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-12 px-8 py-2">
              <Mic2 className="w-5 h-5 mr-2" /> Start Broadcasting
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 border-y border-border bg-card/50">
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="flex flex-col items-center justify-center text-center space-y-2">
              <Radio className="w-8 h-8 text-primary" />
              <h3 className="text-3xl font-bold">{stats?.liveBroadcasts || 0}</h3>
              <p className="text-muted-foreground text-sm uppercase tracking-wider">Live Now</p>
            </div>
            <div className="flex flex-col items-center justify-center text-center space-y-2">
              <Users className="w-8 h-8 text-secondary" />
              <h3 className="text-3xl font-bold">{stats?.totalListeners || 0}</h3>
              <p className="text-muted-foreground text-sm uppercase tracking-wider">Listeners</p>
            </div>
            <div className="flex flex-col items-center justify-center text-center space-y-2">
              <Mic2 className="w-8 h-8 text-primary" />
              <h3 className="text-3xl font-bold">{stats?.totalBroadcasters || 0}</h3>
              <p className="text-muted-foreground text-sm uppercase tracking-wider">Ministries</p>
            </div>
            <div className="flex flex-col items-center justify-center text-center space-y-2">
              <PlayCircle className="w-8 h-8 text-secondary" />
              <h3 className="text-3xl font-bold">{stats?.totalRecordings || 0}</h3>
              <p className="text-muted-foreground text-sm uppercase tracking-wider">Recordings</p>
            </div>
          </div>
        </div>
      </section>

      {/* Live Now */}
      <section className="py-24 container">
        <div className="flex items-center justify-between mb-12">
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-destructive animate-pulse" /> Live Now
          </h2>
          <Link href="/browse" className="text-primary hover:underline font-medium">View all</Link>
        </div>
        
        {liveBroadcasts && liveBroadcasts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {liveBroadcasts.map((broadcast: any) => (
              <Link key={broadcast.id} href={`/broadcast/${broadcast.id}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer overflow-hidden group border-border bg-card">
                  <div className="aspect-video relative bg-muted overflow-hidden">
                    {broadcast.thumbnailUrl ? (
                      <img src={broadcast.thumbnailUrl} alt={broadcast.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                        <Radio className="w-12 h-12 text-zinc-700" />
                      </div>
                    )}
                    <div className="absolute top-3 left-3 flex gap-2">
                      <Badge variant="destructive" className="animate-pulse shadow-lg font-bold">LIVE</Badge>
                      <Badge variant="secondary" className="shadow-lg bg-black/60 backdrop-blur text-white border-none flex items-center gap-1">
                        <Users className="w-3 h-3" /> {broadcast.listenerCount}
                      </Badge>
                    </div>
                  </div>
                  <CardHeader>
                    <CardTitle className="line-clamp-1">{broadcast.title}</CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-2">
                      <div className="w-6 h-6 rounded-full overflow-hidden bg-muted flex-shrink-0">
                        {broadcast.broadcaster?.avatarUrl ? (
                          <img src={broadcast.broadcaster.avatarUrl} alt={broadcast.broadcaster.name} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-full h-full p-1 text-muted-foreground" />
                        )}
                      </div>
                      <span className="text-foreground font-medium truncate">{broadcast.broadcaster?.name || "Unknown"}</span>
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-card rounded-xl border border-border border-dashed">
            <Radio className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-medium text-foreground mb-2">No broadcasts live right now</h3>
            <p className="text-muted-foreground mb-6">Check back later or explore recorded broadcasts.</p>
            <Link href="/browse" className="text-primary hover:underline">Explore Recordings</Link>
          </div>
        )}
      </section>
    </div>
  );
}

// Ensure User is imported for fallback avatar
import { User } from "lucide-react";