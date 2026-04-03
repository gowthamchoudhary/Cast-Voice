import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";

function Nav() {
  const [, setLocation] = useLocation();
  return (
    <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <button onClick={() => setLocation("/dashboard")} className="font-serif text-xl font-bold text-foreground">
          Cast<span className="text-primary">Voice</span>
        </button>
        <nav className="hidden sm:flex items-center gap-6 text-sm text-muted-foreground">
          <button onClick={() => setLocation("/dashboard")} className="hover:text-foreground transition-colors">Dashboard</button>
          <button onClick={() => setLocation("/stories")} className="hover:text-foreground transition-colors">Stories</button>
          <button onClick={() => setLocation("/settings")} className="text-foreground font-medium">Settings</button>
        </nav>
      </div>
    </header>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const api = useApi();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [voiceSamples, setVoiceSamples] = useState<File[]>([]);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ["/api/users/profile"],
    queryFn: () => api.get("/api/users/profile").then((r) => r.json()),
  });

  useEffect(() => {
    if (profileData && !profileLoaded) {
      const p = profileData as any;
      setDisplayName(p.displayName || user?.name || "");
      setBio(p.bio || "");
      setProfileLoaded(true);
    }
  }, [profileData, profileLoaded, user]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      const r = await api.put("/api/users/profile", { displayName, bio });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
      toast({ title: "Profile saved!" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const cloneVoice = useMutation({
    mutationFn: async () => {
      if (voiceSamples.length === 0) throw new Error("Please select voice samples first.");
      const formData = new FormData();
      voiceSamples.forEach((f) => formData.append("samples", f));
      const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");
      const r = await fetch(`${BASE_URL}/api/users/voice-clone`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Voice cloned!", description: "Your voice clone is ready to use." });
      queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleLogout = () => {
    window.location.href = "/api/auth/logout";
  };

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="font-serif text-3xl font-bold text-foreground mb-8">Settings</h1>

        {/* Profile section */}
        <section className="bg-card border border-border rounded-xl p-6 mb-6">
          <h2 className="font-serif text-xl font-semibold text-foreground mb-4">Your Profile</h2>
          {profileLoading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4 mb-4">
                {user?.profileImage ? (
                  <img src={user.profileImage} alt="" className="w-16 h-16 rounded-full border border-border" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-2xl text-primary font-serif font-bold">
                    {(user?.name || "U")[0]}
                  </div>
                )}
                <div>
                  <p className="font-medium text-foreground">{user?.name}</p>
                  <p className="text-sm text-muted-foreground">{user?.id}</p>
                </div>
              </div>
              <div>
                <Label>Display Name</Label>
                <Input
                  className="mt-1"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your display name"
                />
              </div>
              <div>
                <Label>Bio</Label>
                <Textarea
                  className="mt-1"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us about yourself..."
                  rows={3}
                />
              </div>
              <Button
                onClick={() => saveProfile.mutate()}
                disabled={saveProfile.isPending}
                className="glow-primary"
              >
                {saveProfile.isPending ? <Spinner className="w-4 h-4 mr-2" /> : null}
                Save Profile
              </Button>
            </div>
          )}
        </section>

        {/* Voice Clone section */}
        <section className="bg-card border border-border rounded-xl p-6 mb-6">
          <h2 className="font-serif text-xl font-semibold text-foreground mb-1">Voice Clone</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Upload 1–5 audio samples of your voice (WAV or MP3, 30 seconds to 5 minutes each). We'll create a high-quality clone you can use in any audio drama.
          </p>
          <div className="space-y-3">
            <div
              className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/40 transition-colors cursor-pointer"
              onClick={() => document.getElementById("voice-file-input")?.click()}
            >
              <div className="text-3xl mb-2">🎤</div>
              <p className="text-sm text-muted-foreground">
                {voiceSamples.length > 0
                  ? `${voiceSamples.length} file(s) selected`
                  : "Click to select audio files"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">WAV, MP3 · Up to 5 files</p>
            </div>
            <input
              id="voice-file-input"
              type="file"
              accept="audio/*"
              multiple
              className="hidden"
              onChange={(e) => setVoiceSamples(Array.from(e.target.files || []))}
            />
            <Button
              onClick={() => cloneVoice.mutate()}
              disabled={voiceSamples.length === 0 || cloneVoice.isPending}
              className="w-full"
              variant="outline"
            >
              {cloneVoice.isPending ? <Spinner className="w-4 h-4 mr-2" /> : null}
              Clone My Voice
            </Button>
          </div>
        </section>

        {/* Account section */}
        <section className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-serif text-xl font-semibold text-foreground mb-4">Account</h2>
          <Button variant="outline" onClick={handleLogout} className="text-destructive border-destructive/30 hover:bg-destructive/10">
            Sign Out
          </Button>
        </section>
      </main>
    </div>
  );
}
