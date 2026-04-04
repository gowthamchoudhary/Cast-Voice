import { useState, useEffect, useRef } from "react";
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
  const [voiceTab, setVoiceTab] = useState<"upload" | "record">("upload");
  const [recording, setRecording] = useState(false);
  const [recordedBlobs, setRecordedBlobs] = useState<Blob[]>([]);
  const [currentBlob, setCurrentBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    mutationFn: async (files: File[]) => {
      if (files.length === 0) throw new Error("Please provide at least one voice sample.");
      const formData = new FormData();
      files.forEach((f) => formData.append("samples", f));
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
      toast({ title: "Voice cloned!", description: "Your voice clone is ready to use in projects." });
      queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
      setVoiceSamples([]);
      setRecordedBlobs([]);
      setCurrentBlob(null);
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        setCurrentBlob(blob);
        setRecording(false);
        if (timerRef.current) clearInterval(timerRef.current);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordingTime(0);
      setCurrentBlob(null);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      toast({ title: "Microphone error", description: "Could not access your microphone.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const saveRecording = () => {
    if (!currentBlob) return;
    const file = new File([currentBlob], `recording-${recordedBlobs.length + 1}.webm`, { type: "audio/webm" });
    setRecordedBlobs((prev) => [...prev, currentBlob]);
    setVoiceSamples((prev) => [...prev, file]);
    setCurrentBlob(null);
    setRecordingTime(0);
    toast({ title: "Recording saved", description: `Sample ${recordedBlobs.length + 1} added. You can record more or submit.` });
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const handleLogout = () => {
    window.location.href = "/api/logout";
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
            Provide voice samples and we'll create a high-quality clone you can use in any audio drama.
            Aim for 30 seconds to 5 minutes of clear speech.
          </p>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-muted rounded-lg mb-5 w-fit">
            <button
              onClick={() => setVoiceTab("upload")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                voiceTab === "upload"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Upload Files
            </button>
            <button
              onClick={() => setVoiceTab("record")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                voiceTab === "record"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              🎤 Record Live
            </button>
          </div>

          {voiceTab === "upload" ? (
            <div className="space-y-3">
              <div
                className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/40 transition-colors cursor-pointer"
                onClick={() => document.getElementById("voice-file-input")?.click()}
              >
                <div className="text-3xl mb-2">📁</div>
                <p className="text-sm text-muted-foreground">
                  {voiceSamples.length > 0
                    ? `${voiceSamples.length} file(s) selected`
                    : "Click to select audio files"}
                </p>
                {voiceSamples.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {voiceSamples.map((f, i) => (
                      <p key={i} className="text-xs text-primary">{f.name}</p>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">WAV, MP3, WebM · Up to 5 files</p>
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
                onClick={() => cloneVoice.mutate(voiceSamples)}
                disabled={voiceSamples.length === 0 || cloneVoice.isPending}
                className="w-full glow-primary"
              >
                {cloneVoice.isPending ? <Spinner className="w-4 h-4 mr-2" /> : null}
                Clone My Voice
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Read a passage of text aloud — a few sentences to a minute works best. You can record multiple samples.
              </p>

              {/* Recorder */}
              <div className="bg-muted rounded-xl p-5 flex flex-col items-center gap-4">
                {/* Waveform visual */}
                <div className="flex items-center gap-1 h-10">
                  {Array.from({ length: 16 }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-1 rounded-full transition-all duration-150 ${
                        recording ? "bg-primary" : "bg-border"
                      }`}
                      style={{
                        height: recording
                          ? `${20 + Math.sin((Date.now() / 200 + i) * 1.5) * 14}px`
                          : "8px",
                        animation: recording ? `pulse ${0.4 + i * 0.05}s ease-in-out infinite alternate` : "none",
                      }}
                    />
                  ))}
                </div>

                {recording && (
                  <div className="flex items-center gap-2 text-primary text-sm font-mono">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    {formatTime(recordingTime)}
                  </div>
                )}

                {!recording && currentBlob && (
                  <div className="text-center">
                    <p className="text-sm text-primary mb-1">✓ Recording ready ({formatTime(recordingTime)})</p>
                    <audio
                      controls
                      src={URL.createObjectURL(currentBlob)}
                      className="h-8 mt-1"
                    />
                  </div>
                )}

                <div className="flex gap-2 w-full">
                  {!recording ? (
                    <Button
                      onClick={startRecording}
                      className="flex-1"
                      variant={currentBlob ? "outline" : "default"}
                    >
                      {currentBlob ? "Re-record" : "Start Recording"}
                    </Button>
                  ) : (
                    <Button
                      onClick={stopRecording}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0"
                    >
                      ⏹ Stop
                    </Button>
                  )}
                  {currentBlob && !recording && (
                    <Button
                      onClick={saveRecording}
                      className="flex-1 glow-primary"
                      disabled={recordedBlobs.length >= 5}
                    >
                      Add Sample
                    </Button>
                  )}
                </div>
              </div>

              {/* Saved recordings list */}
              {recordedBlobs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">{recordedBlobs.length} sample(s) ready</p>
                  {recordedBlobs.map((blob, i) => (
                    <div key={i} className="flex items-center gap-3 bg-muted rounded-lg px-3 py-2">
                      <span className="text-primary text-xs font-mono">#{i + 1}</span>
                      <audio controls src={URL.createObjectURL(blob)} className="h-7 flex-1" />
                      <button
                        onClick={() => {
                          setRecordedBlobs((prev) => prev.filter((_, j) => j !== i));
                          setVoiceSamples((prev) => prev.filter((_, j) => j !== i));
                        }}
                        className="text-muted-foreground hover:text-destructive text-xs transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Button
                onClick={() => cloneVoice.mutate(voiceSamples)}
                disabled={voiceSamples.length === 0 || cloneVoice.isPending || recording}
                className="w-full glow-primary"
              >
                {cloneVoice.isPending ? <Spinner className="w-4 h-4 mr-2" /> : null}
                {voiceSamples.length > 0
                  ? `Clone My Voice (${voiceSamples.length} sample${voiceSamples.length > 1 ? "s" : ""})`
                  : "Clone My Voice"}
              </Button>
            </div>
          )}
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
