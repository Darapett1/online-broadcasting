import { useListBroadcasts, useSearchBroadcasts, getSearchBroadcastsQueryKey, getListBroadcastsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Radio, Users, User, PlayCircle, Clock, Tag, X } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { formatDistanceToNow } from "date-fns";

type Filter = "ALL" | "LIVE" | "RECORDED";

export default function Browse() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const debouncedQ = useDebounce(searchQuery, 300);

  const { data: searchResults, isLoading: searchLoading } = useSearchBroadcasts(
    { q: debouncedQ },
    { query: { queryKey: getSearchBroadcastsQueryKey({ q: debouncedQ }), enabled: debouncedQ.trim().length > 1 } }
  );

  const { data: allBroadcasts, isLoading: allLoading } = useListBroadcasts(
    undefined,
    { query: { queryKey: getListBroadcastsQueryKey() } }
  );

  let displayed = debouncedQ.trim().length > 1 ? searchResults : allBroadcasts;
  const isLoading = debouncedQ.trim().length > 1 ? searchLoading : allLoading;

  if (displayed && filter !== "ALL") {
    displayed = displayed.filter((b: any) => filter === "LIVE" ? b.isLive : !b.isLive);
  }

  const setTag = (tag: string) => setSearchQuery(tag);

  const FILTERS: { id: Filter; label: string }[] = [
    { id: "ALL",      label: "All" },
    { id: "LIVE",     label: "Live" },
    { id: "RECORDED", label: "Recorded" },
  ];

  return (
    <div className="container py-10 px-4 md:px-6">
      {/* Header */}
      <div className="mb-10 space-y-6">
        <h1 className="text-5xl font-black tracking-widest uppercase">DISCOVER</h1>

        {/* Search bar */}
        <div className="relative max-w-3xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by title, minister, tag…"
            className="pl-12 h-14 text-base bg-card/80 border-border focus-visible:ring-primary focus-visible:ring-2 focus-visible:border-primary rounded-xl"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Popular tags (from static list — shown when no search active) */}
        {!searchQuery && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5 mr-1">
              <Tag className="w-3 h-3" /> Popular tags:
            </span>
            {["worship", "gospel", "sermon", "prayer", "praise", "healing", "evangelism", "sunday", "choir", "youth"].map((tag) => (
              <button
                key={tag}
                onClick={() => setTag(tag)}
                className="text-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 hover:border-primary/40 transition-colors px-2.5 py-1 rounded-full font-medium"
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`pb-3 px-5 text-sm font-bold tracking-wider uppercase transition-colors relative ${
                filter === id ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {filter === id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t" />}
            </button>
          ))}
          {debouncedQ.trim().length > 1 && (
            <span className="ml-auto pb-3 text-xs text-muted-foreground">
              {displayed?.length ?? 0} result{displayed?.length !== 1 ? "s" : ""} for "{debouncedQ}"
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1,2,3,4,5,6,7,8].map((i) => (
            <div key={i} className="animate-pulse bg-card rounded-xl border border-transparent overflow-hidden">
              <div className="aspect-video bg-muted" />
              <div className="p-4 space-y-3">
                <div className="h-5 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2" />
                <div className="flex gap-1"><div className="h-5 bg-muted rounded-full w-14" /><div className="h-5 bg-muted rounded-full w-16" /></div>
              </div>
            </div>
          ))}
        </div>
      ) : displayed && displayed.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {displayed.map((broadcast: any) => (
            <BroadcastCard key={broadcast.id} broadcast={broadcast} onTagClick={setTag} />
          ))}
        </div>
      ) : (
        <div className="text-center py-28 bg-card/40 rounded-2xl border border-dashed border-border">
          <Search className="w-14 h-14 text-muted-foreground mx-auto mb-5 opacity-25" />
          <h3 className="text-2xl font-bold mb-2 uppercase tracking-wider">Nothing found</h3>
          <p className="text-muted-foreground mb-6">
            {debouncedQ ? `No broadcasts match "${debouncedQ}".` : "No broadcasts yet."}
          </p>
          {debouncedQ && (
            <button onClick={() => setSearchQuery("")} className="text-primary text-sm font-medium hover:underline">
              Clear search
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BroadcastCard({ broadcast, onTagClick }: { broadcast: any; onTagClick: (t: string) => void }) {
  return (
    <div className="group bg-card border border-transparent hover:border-primary/40 transition-all duration-300 rounded-xl overflow-hidden flex flex-col shadow-md hover:shadow-primary/10 hover:shadow-lg">
      {/* Thumbnail */}
      <Link href={`/broadcast/${broadcast.id}`}>
        <div className="aspect-video relative bg-muted overflow-hidden cursor-pointer flex-shrink-0">
          {broadcast.thumbnailUrl ? (
            <img src={broadcast.thumbnailUrl} alt={broadcast.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-zinc-900 group-hover:bg-zinc-800 transition-colors">
              <Radio className="w-12 h-12 text-zinc-700" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

          {/* Badges */}
          <div className="absolute top-2.5 left-2.5 flex gap-1.5">
            {broadcast.isLive ? (
              <Badge variant="destructive" className="animate-pulse text-xs font-bold tracking-wider px-2 py-0.5">LIVE</Badge>
            ) : (
              <Badge variant="secondary" className="bg-black/60 backdrop-blur text-white border-none text-xs flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" /> Recorded
              </Badge>
            )}
            {broadcast.isLive && broadcast.listenerCount > 0 && (
              <Badge variant="secondary" className="bg-black/60 backdrop-blur text-white border-none text-xs flex items-center gap-1">
                <Users className="w-2.5 h-2.5" /> {broadcast.listenerCount}
              </Badge>
            )}
          </div>

          {/* Avatar */}
          <div className="absolute bottom-2.5 left-2.5">
            <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-background shadow">
              {broadcast.broadcaster?.avatarUrl ? (
                <img src={broadcast.broadcaster.avatarUrl} alt={broadcast.broadcaster.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-zinc-800 flex items-center justify-center"><User className="w-4 h-4 text-zinc-500" /></div>
              )}
            </div>
          </div>
        </div>
      </Link>

      {/* Info */}
      <div className="p-3.5 flex flex-col flex-1">
        <Link href={`/broadcast/${broadcast.id}`}>
          <h3 className="font-bold text-sm line-clamp-2 leading-snug mb-1 group-hover:text-primary transition-colors cursor-pointer">{broadcast.title}</h3>
        </Link>
        <p className="text-xs text-foreground/70 font-medium truncate mb-1">{broadcast.broadcaster?.name || "Unknown"}</p>
        <p className="text-xs text-muted-foreground mb-2">
          {formatDistanceToNow(new Date(broadcast.startedAt), { addSuffix: true })}
        </p>

        {/* Clickable tag chips */}
        {broadcast.tags && broadcast.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-auto pt-2 border-t border-border/40">
            {(broadcast.tags as string[]).slice(0, 4).map((tag) => (
              <button
                key={tag}
                onClick={() => onTagClick(tag)}
                className="text-[10px] bg-primary/8 text-primary/70 hover:bg-primary/20 hover:text-primary border border-primary/15 hover:border-primary/30 transition-all px-2 py-0.5 rounded-full"
              >
                #{tag}
              </button>
            ))}
            {broadcast.tags.length > 4 && (
              <span className="text-[10px] text-muted-foreground/50 px-1 self-center">+{broadcast.tags.length - 4}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
