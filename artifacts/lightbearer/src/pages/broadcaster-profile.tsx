import { useState } from "react";
import { useGetBroadcaster, useGetBroadcasterRecordings, useListBroadcasts, useUpdateBroadcaster } from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { User, Radio, Edit, Download, Clock, PlayCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { getGetBroadcasterQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export default function BroadcasterProfile() {
  const { id } = useParams();
  const { broadcaster: me } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const isOwnProfile = !id || (me && me.id === parseInt(id));
  const targetId = isOwnProfile && me ? me.id : parseInt(id || "0");

  const { data: profile, isLoading: isProfileLoading } = useGetBroadcaster(targetId, {
    query: { enabled: !!targetId }
  });

  const { data: recordings, isLoading: isRecordingsLoading } = useGetBroadcasterRecordings(targetId, {
    query: { enabled: !!targetId }
  });

  const { data: activeBroadcasts } = useListBroadcasts({ query: { queryKey: ["broadcasts", { live: true }] }, request: { query: { live: true } } } as any);
  const liveBroadcast = activeBroadcasts?.find(b => b.broadcasterId === targetId && b.isLive);

  const updateProfileMutation = useUpdateBroadcaster();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    bio: "",
    phone: "",
    avatarUrl: "",
    coverUrl: ""
  });

  const handleEditOpen = () => {
    if (profile) {
      setEditForm({
        name: profile.name || "",
        bio: profile.bio || "",
        phone: profile.phone || "",
        avatarUrl: profile.avatarUrl || "",
        coverUrl: profile.coverUrl || ""
      });
      setIsEditOpen(true);
    }
  };

  const handleSaveProfile = async () => {
    try {
      const res = await updateProfileMutation.mutateAsync({
        id: targetId,
        data: editForm
      });
      queryClient.setQueryData(getGetBroadcasterQueryKey(targetId), res);
      setIsEditOpen(false);
      toast({ title: "Profile updated successfully." });
    } catch (err: any) {
      toast({ title: "Failed to update profile", description: err.message, variant: "destructive" });
    }
  };

  if (isProfileLoading) {
    return <div className="min-h-screen container py-20 animate-pulse flex flex-col gap-6">
      <div className="h-64 bg-card rounded-xl"></div>
      <div className="h-32 bg-card rounded-xl -mt-16 mx-8"></div>
    </div>;
  }

  if (!profile) return <div className="container py-20 text-center">Profile not found</div>;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Cover Photo */}
      <div className="h-64 md:h-80 w-full relative bg-muted border-b border-border">
        {profile.coverUrl ? (
          <img src={profile.coverUrl} alt="Cover" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-tr from-card to-muted flex items-center justify-center">
            <Radio className="w-24 h-24 text-muted-foreground opacity-20" />
          </div>
        )}
      </div>

      <div className="container relative">
        {/* Profile Info Overlay */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-2xl relative -mt-24 md:-mt-32 mb-8 z-10 flex flex-col md:flex-row gap-6 items-start md:items-end">
          <div className="h-32 w-32 md:h-40 md:w-40 rounded-xl overflow-hidden border-4 border-card bg-muted flex-shrink-0 shadow-xl relative">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              <User className="w-full h-full p-6 text-muted-foreground" />
            )}
            {liveBroadcast && (
              <div className="absolute inset-0 border-4 border-destructive rounded-xl animate-pulse"></div>
            )}
          </div>

          <div className="flex-1 pb-2 w-full">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-foreground font-sans flex items-center gap-3">
                  {profile.name}
                  {liveBroadcast && <Badge variant="destructive" className="animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]">LIVE NOW</Badge>}
                </h1>
                <p className="text-primary font-medium text-lg mt-1">@{profile.username}</p>
              </div>
              
              <div className="flex items-center gap-3">
                {isOwnProfile ? (
                  <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" onClick={handleEditOpen}><Edit className="w-4 h-4 mr-2" /> Edit Profile</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>Edit Profile</DialogTitle>
                        <DialogDescription>
                          Make changes to your broadcaster profile here. Click save when you're done.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="name">Name</Label>
                          <Input id="name" value={editForm.name} onChange={(e) => setEditForm(prev => ({...prev, name: e.target.value}))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="bio">Bio</Label>
                          <Textarea id="bio" value={editForm.bio} onChange={(e) => setEditForm(prev => ({...prev, bio: e.target.value}))} rows={3} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="avatarUrl">Avatar URL</Label>
                          <Input id="avatarUrl" value={editForm.avatarUrl} onChange={(e) => setEditForm(prev => ({...prev, avatarUrl: e.target.value}))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="coverUrl">Cover URL</Label>
                          <Input id="coverUrl" value={editForm.coverUrl} onChange={(e) => setEditForm(prev => ({...prev, coverUrl: e.target.value}))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="phone">Phone</Label>
                          <Input id="phone" value={editForm.phone} onChange={(e) => setEditForm(prev => ({...prev, phone: e.target.value}))} />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="button" onClick={handleSaveProfile} disabled={updateProfileMutation.isPending}>
                          {updateProfileMutation.isPending ? "Saving..." : "Save changes"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <Button className="bg-primary text-primary-foreground hover:bg-primary/90">Follow</Button>
                )}
                {liveBroadcast && !isOwnProfile && (
                  <Link href={`/broadcast/${liveBroadcast.id}`}>
                    <Button variant="destructive" className="animate-pulse">Listen Live</Button>
                  </Link>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-sm text-muted-foreground">
              <span><strong className="text-foreground">{profile.followerCount}</strong> Followers</span>
              <span><strong className="text-foreground">{profile.broadcastCount}</strong> Broadcasts</span>
              <span>Joined {new Date(profile.createdAt).toLocaleDateString()}</span>
            </div>
            
            {profile.bio && (
              <p className="mt-4 text-foreground/90 max-w-3xl leading-relaxed">{profile.bio}</p>
            )}
          </div>
        </div>

        {/* Tabs Content */}
        <Tabs defaultValue="recordings" className="w-full">
          <TabsList className="w-full justify-start h-auto p-0 bg-transparent border-b border-border rounded-none mb-8">
            <TabsTrigger value="recordings" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3 text-base">Recordings</TabsTrigger>
            <TabsTrigger value="about" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3 text-base">About</TabsTrigger>
          </TabsList>
          
          <TabsContent value="recordings" className="mt-0">
            {isRecordingsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="h-32 bg-card animate-pulse rounded-xl border border-border"></div>
              </div>
            ) : recordings && recordings.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recordings.map(rec => (
                  <Card key={rec.id} className="bg-card border-border hover:border-primary/30 transition-colors flex flex-row overflow-hidden">
                    <div className="w-32 bg-muted relative flex-shrink-0">
                       {rec.thumbnailUrl ? (
                        <img src={rec.thumbnailUrl} className="w-full h-full object-cover" />
                       ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <PlayCircle className="w-8 h-8 text-muted-foreground" />
                        </div>
                       )}
                    </div>
                    <div className="flex-1 p-4 flex flex-col justify-between">
                      <div>
                        <h3 className="font-bold text-lg line-clamp-1">{rec.title}</h3>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {formatDistanceToNow(new Date(rec.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      <div className="flex justify-between items-center mt-4">
                        <span className="text-xs font-mono text-muted-foreground">
                          {rec.durationSeconds ? `${Math.floor(rec.durationSeconds/60)}:${(rec.durationSeconds%60).toString().padStart(2,'0')}` : '--:--'}
                        </span>
                        <Button variant="secondary" size="sm" className="h-8 text-xs">
                          <Download className="w-3 h-3 mr-1" /> Download
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 bg-card/50 rounded-xl border border-dashed border-border">
                <Radio className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <h3 className="text-lg font-medium text-foreground">No recordings available</h3>
                <p className="text-muted-foreground">This broadcaster hasn't published any recordings yet.</p>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="about" className="mt-0">
             <Card className="bg-card border-border">
               <CardContent className="p-6 space-y-4">
                 <div>
                   <h3 className="font-bold text-lg mb-1">Contact</h3>
                   <p className="text-muted-foreground">{profile.email}</p>
                   {profile.phone && <p className="text-muted-foreground">{profile.phone}</p>}
                 </div>
               </CardContent>
             </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
