import { useListBroadcasts, useSearchBroadcasts } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Radio, Users, User, PlayCircle, Clock } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { formatDistanceToNow } from "date-fns";

export default function Browse() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | "LIVE" | "RECORDED">("ALL");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data: searchResults, isLoading: isSearchLoading } = useSearchBroadcasts(
    { q: debouncedSearch },
    { query: { enabled: debouncedSearch.length > 2 } }
  );

  const { data: allBroadcasts, isLoading: isAllLoading } = useListBroadcasts();

  let displayedBroadcasts = debouncedSearch.length > 2 ? searchResults : allBroadcasts;
  const isLoading = debouncedSearch.length > 2 ? isSearchLoading : isAllLoading;

  if (displayedBroadcasts && filter !== "ALL") {
    displayedBroadcasts = displayedBroadcasts.filter((b: any) => 
      filter === "LIVE" ? b.isLive : !b.isLive
    );
  }

  return (
    <div className="container py-12 px-6">
      <div className="flex flex-col gap-8 mb-12">
        <h1 className="text-5xl font-black tracking-widest uppercase">DISCOVER</h1>
        
        <div className="relative max-w-3xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground" />
          <Input 
            placeholder="Search ministries, preachers, venues..." 
            className="pl-14 h-16 text-lg bg-card/80 border-border focus-visible:ring-primary focus-visible:ring-2 focus-visible:border-primary rounded-xl"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-8 border-b border-border">
          <button 
            onClick={() => setFilter("ALL")}
            className={`pb-4 text-sm font-bold tracking-widest uppercase transition-colors relative ${filter === "ALL" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            ALL
            {filter === "ALL" && <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-md"></div>}
          </button>
          <button 
            onClick={() => setFilter("LIVE")}
            className={`pb-4 text-sm font-bold tracking-widest uppercase transition-colors relative ${filter === "LIVE" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            LIVE
            {filter === "LIVE" && <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-md"></div>}
          </button>
          <button 
            onClick={() => setFilter("RECORDED")}
            className={`pb-4 text-sm font-bold tracking-widest uppercase transition-colors relative ${filter === "RECORDED" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            RECORDED
            {filter === "RECORDED" && <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-md"></div>}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="animate-pulse bg-card rounded-xl border border-transparent overflow-hidden">
              <div className="aspect-video bg-muted"></div>
              <div className="p-4 space-y-3">
                <div className="h-6 bg-muted rounded-md w-3/4"></div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted"></div>
                  <div className="h-4 bg-muted rounded-md w-1/2"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : displayedBroadcasts && displayedBroadcasts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {displayedBroadcasts.map((broadcast: any) => (
            <Link key={broadcast.id} href={`/broadcast/${broadcast.id}`}>
              <Card className="bg-card border-transparent hover:border-primary/50 transition-all duration-300 cursor-pointer overflow-hidden group h-full flex flex-col shadow-md">
                <div className="aspect-video relative bg-muted overflow-hidden flex-shrink-0">
                  {broadcast.thumbnailUrl ? (
                    <img src={broadcast.thumbnailUrl} alt={broadcast.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-900 group-hover:bg-zinc-800 transition-colors">
                      <Radio className="w-12 h-12 text-zinc-700" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                  <div className="absolute top-3 left-3 flex gap-2">
                    {broadcast.isLive ? (
                      <Badge variant="destructive" className="animate-pulse shadow-lg font-bold tracking-wider text-xs px-2 py-0.5">LIVE</Badge>
                    ) : (
                      <Badge variant="secondary" className="shadow-lg bg-black/60 backdrop-blur text-white border-none flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Recorded
                      </Badge>
                    )}
                    {broadcast.isLive && (
                      <Badge variant="secondary" className="shadow-lg bg-black/60 backdrop-blur text-white border-none flex items-center gap-1">
                        <Users className="w-3 h-3" /> {broadcast.listenerCount}
                      </Badge>
                    )}
                  </div>
                  <div className="absolute bottom-3 left-3 flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex-shrink-0 border-2 border-background shadow-md">
                      {broadcast.broadcaster?.avatarUrl ? (
                        <img src={broadcast.broadcaster.avatarUrl} alt={broadcast.broadcaster.name} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-full h-full p-2 text-muted-foreground bg-zinc-800" />
                      )}
                    </div>
                  </div>
                </div>
                <CardHeader className="pt-4 pb-5 flex-1">
                  <CardTitle className="text-lg font-bold line-clamp-2 leading-tight mb-2 group-hover:text-primary transition-colors">{broadcast.title}</CardTitle>
                  <CardDescription className="flex flex-col mt-auto">
                    <span className="text-foreground font-medium text-sm truncate">{broadcast.broadcaster?.name || "Unknown"}</span>
                    <span className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(broadcast.startedAt), { addSuffix: true })}
                    </span>
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-32 bg-card rounded-2xl border border-border border-dashed">
          <Search className="w-16 h-16 text-muted-foreground mx-auto mb-6 opacity-30" />
          <h3 className="text-2xl font-bold text-foreground mb-3 uppercase tracking-wider">No broadcasts found</h3>
          <p className="text-muted-foreground text-lg">Try adjusting your search terms or filters.</p>
        </div>
      )}
    </div>
  );
}
