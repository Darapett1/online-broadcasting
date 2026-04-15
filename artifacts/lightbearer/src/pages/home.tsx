import { useGetPlatformStats, useListBroadcasts } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Radio, Users, Mic2, PlayCircle, User } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  const { data: stats } = useGetPlatformStats();
  const { data: liveBroadcasts } = useListBroadcasts({ query: { queryKey: ["broadcasts", { live: true }] }, request: { query: { live: true } } } as any);
  const { data: recentBroadcasts } = useListBroadcasts({ query: { queryKey: ["broadcasts", { live: false }] }, request: { query: { live: false } } } as any);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero */}
      <section className="relative py-24 md:py-32 lg:py-48 overflow-hidden bg-background flex flex-col items-center justify-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none"></div>
        
        {/* Pure CSS Animated Rings */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-20">
          <div className="w-[300px] h-[300px] rounded-full border border-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
          <div className="w-[450px] h-[450px] rounded-full border border-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite_0.5s]"></div>
          <div className="w-[600px] h-[600px] rounded-full border border-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite_1s]"></div>
        </div>

        <div className="container relative z-10 text-center flex flex-col items-center px-4">
          <Badge variant="outline" className="border-destructive text-destructive mb-8 px-5 py-1.5 text-sm bg-destructive/10 font-bold uppercase tracking-widest flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" /> {stats?.liveBroadcasts || 0} LIVE NOW
          </Badge>
          <h1 className="text-5xl md:text-7xl lg:text-9xl font-black tracking-widest mb-6 max-w-5xl text-transparent bg-clip-text bg-gradient-to-b from-primary via-primary/80 to-primary/40 font-sans uppercase">
            THE LIGHTBEARER
          </h1>
          <p className="text-lg md:text-2xl text-foreground font-medium mb-12 max-w-2xl tracking-wide">
            Proclaim the Word to the Ends of the Earth
          </p>
          <div className="flex flex-col sm:flex-row gap-6 w-full sm:w-auto">
            <Link href="/browse" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-base font-bold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-14 px-10 shadow-[0_0_20px_rgba(234,179,8,0.3)]">
              Listen Live
            </Link>
            <Link href="/register" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-base font-bold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border-2 border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background h-14 px-10">
              Start Broadcasting
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-8 bg-card border-y border-border">
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
            <div className="flex flex-col items-center justify-center text-center space-y-1 p-4">
              <Radio className="w-6 h-6 text-primary mb-2" />
              <h3 className="text-4xl font-black text-foreground">{stats?.liveBroadcasts || 0}</h3>
              <p className="text-muted-foreground text-xs uppercase tracking-widest font-bold">Live Now</p>
            </div>
            <div className="flex flex-col items-center justify-center text-center space-y-1 p-4">
              <Users className="w-6 h-6 text-primary mb-2" />
              <h3 className="text-4xl font-black text-foreground">{stats?.totalListeners || 0}</h3>
              <p className="text-muted-foreground text-xs uppercase tracking-widest font-bold">Listeners</p>
            </div>
            <div className="flex flex-col items-center justify-center text-center space-y-1 p-4">
              <Mic2 className="w-6 h-6 text-primary mb-2" />
              <h3 className="text-4xl font-black text-foreground">{stats?.totalBroadcasters || 0}</h3>
              <p className="text-muted-foreground text-xs uppercase tracking-widest font-bold">Ministries</p>
            </div>
            <div className="flex flex-col items-center justify-center text-center space-y-1 p-4">
              <PlayCircle className="w-6 h-6 text-primary mb-2" />
              <h3 className="text-4xl font-black text-foreground">{stats?.totalRecordings || 0}</h3>
              <p className="text-muted-foreground text-xs uppercase tracking-widest font-bold">Recordings</p>
            </div>
          </div>
        </div>
      </section>

      {/* Live Now */}
      <section className="py-20 container px-6">
        <div className="flex items-center justify-between mb-10 border-b border-border pb-4">
          <h2 className="text-4xl font-black tracking-wider flex items-center gap-4 uppercase">
            <span className="w-4 h-4 rounded-full bg-destructive animate-pulse" /> LIVE NOW
          </h2>
          <Link href="/browse" className="text-primary hover:text-primary/80 font-bold uppercase tracking-widest text-sm">View all</Link>
        </div>
        
        {liveBroadcasts && liveBroadcasts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {liveBroadcasts.map((broadcast: any) => (
              <Link key={broadcast.id} href={`/broadcast/${broadcast.id}`}>
                <Card className="bg-card border-transparent hover:border-primary/50 transition-all duration-300 cursor-pointer overflow-hidden group h-full flex flex-col shadow-lg">
                  <div className="aspect-video relative bg-muted overflow-hidden flex-shrink-0">
                    {broadcast.thumbnailUrl ? (
                      <img src={broadcast.thumbnailUrl} alt={broadcast.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-zinc-900 group-hover:bg-zinc-800 transition-colors">
                        <Radio className="w-16 h-16 text-zinc-700" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                    <div className="absolute top-4 left-4 flex gap-2">
                      <Badge variant="destructive" className="animate-pulse shadow-lg font-bold tracking-widest">LIVE</Badge>
                    </div>
                    <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-muted flex-shrink-0 border-2 border-background shadow-md">
                          {broadcast.broadcaster?.avatarUrl ? (
                            <img src={broadcast.broadcaster.avatarUrl} alt={broadcast.broadcaster.name} className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-full h-full p-2 text-muted-foreground bg-zinc-800" />
                          )}
                        </div>
                        <Badge variant="secondary" className="shadow-lg bg-black/80 backdrop-blur text-white border-none flex items-center gap-2 py-1 px-3">
                          <Users className="w-4 h-4" /> {broadcast.listenerCount}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <CardHeader className="pt-6 pb-6">
                    <CardTitle className="text-xl font-bold line-clamp-1 mb-2 group-hover:text-primary transition-colors">{broadcast.title}</CardTitle>
                    <CardDescription className="text-foreground/80 font-medium truncate text-base">
                      {broadcast.broadcaster?.name || "Unknown Ministry"}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-32 bg-card rounded-2xl border border-border border-dashed">
            <Radio className="w-16 h-16 text-muted-foreground mx-auto mb-6 opacity-30" />
            <h3 className="text-2xl font-bold text-foreground mb-3 uppercase tracking-wider">No broadcasts live right now</h3>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto text-lg">The studio is currently quiet. Be the first to go live and share the word.</p>
            <Link href="/register" className="inline-flex items-center justify-center rounded-md text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8">Start Broadcasting</Link>
          </div>
        )}
      </section>

      {/* Recent Broadcasts */}
      <section className="py-20 container px-6 bg-card/30">
        <div className="flex items-center justify-between mb-10 border-b border-border pb-4">
          <h2 className="text-4xl font-black tracking-wider flex items-center gap-4 uppercase">
            RECENT RECORDINGS
          </h2>
        </div>
        
        {recentBroadcasts && recentBroadcasts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {recentBroadcasts.slice(0, 8).map((broadcast: any) => (
              <Link key={broadcast.id} href={`/broadcast/${broadcast.id}`}>
                <Card className="bg-card border-transparent hover:border-primary/30 transition-all duration-300 cursor-pointer overflow-hidden group h-full flex flex-col">
                  <div className="aspect-video relative bg-muted overflow-hidden flex-shrink-0">
                    {broadcast.thumbnailUrl ? (
                      <img src={broadcast.thumbnailUrl} alt={broadcast.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-zinc-900 group-hover:bg-zinc-800 transition-colors">
                        <PlayCircle className="w-12 h-12 text-zinc-700" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"></div>
                    <div className="absolute bottom-3 left-3 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-muted flex-shrink-0 border-2 border-background">
                        {broadcast.broadcaster?.avatarUrl ? (
                          <img src={broadcast.broadcaster.avatarUrl} alt={broadcast.broadcaster.name} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-full h-full p-1 text-muted-foreground bg-zinc-800" />
                        )}
                      </div>
                    </div>
                  </div>
                  <CardHeader className="pt-4 pb-4">
                    <CardTitle className="text-lg font-bold line-clamp-1 mb-1 group-hover:text-primary transition-colors">{broadcast.title}</CardTitle>
                    <CardDescription className="text-muted-foreground font-medium truncate text-sm">
                      {broadcast.broadcaster?.name || "Unknown Ministry"}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-card rounded-2xl border border-border">
            <PlayCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
            <h3 className="text-xl font-bold text-foreground mb-2 uppercase tracking-wide">No recordings yet</h3>
            <p className="text-muted-foreground">Recorded broadcasts will appear here.</p>
          </div>
        )}
      </section>
    </div>
  );
}
