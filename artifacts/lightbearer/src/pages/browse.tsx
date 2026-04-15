import { useListBroadcasts, useSearchBroadcasts } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Radio, Users, User, PlayCircle, Clock } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { formatDistanceToNow } from "date-fns";

export default function Browse() {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data: searchResults, isLoading: isSearchLoading } = useSearchBroadcasts(
    { q: debouncedSearch },
    { query: { enabled: debouncedSearch.length > 2 } }
  );

  const { data: allBroadcasts, isLoading: isAllLoading } = useListBroadcasts();

  const displayedBroadcasts = debouncedSearch.length > 2 ? searchResults : allBroadcasts;
  const isLoading = debouncedSearch.length > 2 ? isSearchLoading : isAllLoading;

  return (
    <div className="container py-12">
      <div className="flex flex-col gap-6 mb-12">
        <h1 className="text-4xl font-bold tracking-tight">Browse Broadcasts</h1>
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input 
            placeholder="Search ministries, preachers, venues, or topics..." 
            className="pl-10 h-12 text-lg bg-card/50 border-primary/20 focus-visible:ring-primary"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="animate-pulse bg-card rounded-xl border border-border h-72"></div>
          ))}
        </div>
      ) : displayedBroadcasts && displayedBroadcasts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedBroadcasts.map((broadcast: any) => (
            <Link key={broadcast.id} href={`/broadcast/${broadcast.id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer overflow-hidden group border-border bg-card h-full flex flex-col">
                <div className="aspect-video relative bg-muted overflow-hidden flex-shrink-0">
                  {broadcast.thumbnailUrl ? (
                    <img src={broadcast.thumbnailUrl} alt={broadcast.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                      <Radio className="w-12 h-12 text-zinc-700" />
                    </div>
                  )}
                  <div className="absolute top-3 left-3 flex gap-2">
                    {broadcast.isLive ? (
                      <Badge variant="destructive" className="animate-pulse shadow-lg font-bold">LIVE</Badge>
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
                </div>
                <CardHeader className="flex-1">
                  <CardTitle className="line-clamp-2 leading-tight">{broadcast.title}</CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-4">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-muted flex-shrink-0">
                      {broadcast.broadcaster?.avatarUrl ? (
                        <img src={broadcast.broadcaster.avatarUrl} alt={broadcast.broadcaster.name} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-full h-full p-1.5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-foreground font-medium text-sm truncate">{broadcast.broadcaster?.name || "Unknown"}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(broadcast.startedAt), { addSuffix: true })}
                      </span>
                    </div>
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-card rounded-xl border border-border border-dashed">
          <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-medium text-foreground mb-2">No broadcasts found</h3>
          <p className="text-muted-foreground">Try adjusting your search terms or browse later.</p>
        </div>
      )}
    </div>
  );
}
