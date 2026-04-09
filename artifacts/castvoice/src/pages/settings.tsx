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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnimatePresence, motion } from "framer-motion";
import { AppNav } from "@/components/app-nav";

type VoiceLibraryEntry = {
  id: number;
  ownerUserId: number;
  personName: string;
  role: string | null;
  group: string | null;
  elevenLabsVoiceId: string;
  inviteUuid: string | null;
  createdAt: string;
};

function VoiceCard({ entry, onDelete }: { entry: VoiceLibraryEntry; onDelete: (id: number) => void }) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

  const playPreview = async () => {
    if (playing && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlaying(false);
      return;
    }
    setLoading(true);
    try {
      const audio = new Audio(`${BASE_URL}/api/voices/${entry.elevenLabsVoiceId}/sample`);
      audioRef.current = audio;
      audio.onended = () => { setPlaying(false); audioRef.current = null; };
      audio.onerror = () => { setPlaying(false); setLoading(false); audioRef.current = null; };
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  };

  const initials = entry.personName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
      <div className="w-11 h-11 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-serif font-bold text-sm shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground text-sm truncate">{entry.personName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {entry.role && <span className="text-xs text-muted-foreground">{entry.role}</span>}
          {entry.group && (
            <Badge variant="outline" className="text-xs py-0 border-primary/30 text-primary">
              {entry.group}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={playPreview}
          disabled={loading}
          className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          title={playing ? "Stop" : "Preview voice"}
        >
          {loading ? <Spinner className="w-3 h-3" /> : playing ? <span className="text-xs">⏹</span> : <span className="text-xs">▶</span>}
        </button>
        <button
          onClick={() => onDelete(entry.id)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Remove from library"
        >
          <span className="text-xs">✕</span>
        </button>
      </div>
    </div>
  );
}

const CATEGORY_OPTIONS = ["Family", "Friends", "Colleagues", "Custom"];
const ROLE_OPTIONS = ["Hero", "Villain", "Narrator", "Side Character", "Mentor", "Comic Relief"];

function AddVoiceModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const api = useApi();
  const { toast } = useToast();

  const [personName, setPersonName] = useState("");
  const [category, setCategory] = useState("Friends");
  const [customCategory, setCustomCategory] = useState("");
  const [role, setRole] = useState("Side Character");
  const [voiceTab, setVoiceTab] = useState<"record" | "upload">("record");
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        setAudioBlob(new Blob(chunks, { type: "audio/webm" }));
        setRecording(false);
        if (timerRef.current) clearInterval(timerRef.current);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordingTime(0);
      setAudioBlob(null);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch {
      toast({ title: "Microphone error", description: "Could not access your microphone.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const toDataUrl = (blob: Blob | File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const handleSubmit = async () => {
    const source = voiceTab === "upload" ? uploadedFile : audioBlob;
    if (!personName.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    if (!source) { toast({ title: "Voice sample required", description: "Please record or upload a voice sample.", variant: "destructive" }); return; }

    setSubmitting(true);
    try {
      const audioDataUrl = await toDataUrl(source);
      const effectiveCategory = category === "Custom" ? (customCategory.trim() || "Other") : category;
      const r = await api.post("/api/users/voice-library", {
        personName: personName.trim(),
        group: effectiveCategory,
        role,
        samples: [audioDataUrl],
      });
      if (!r.ok) {
        const err = await r.text();
        throw new Error(err);
      }
      toast({ title: "Voice added!", description: `${personName}'s voice is now in your library.` });
      onAdded();
      onClose();
      setPersonName(""); setCategory("Friends"); setCustomCategory(""); setRole("Side Character");
      setAudioBlob(null); setUploadedFile(null); setRecordingTime(0);
    } catch (e: unknown) {
      toast({ title: "Failed to add voice", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">Add Voice to Library</DialogTitle>
          <DialogDescription className="text-xs">
            Record or upload a voice sample to clone and save to your Voice Library.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div>
            <Label>Person's Name</Label>
            <Input className="mt-1" value={personName} onChange={e => setPersonName(e.target.value)} placeholder="e.g. Mom, Alex, Dr. Chen" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {category === "Custom" && (
            <div>
              <Label>Custom Category Name</Label>
              <Input className="mt-1" value={customCategory} onChange={e => setCustomCategory(e.target.value)} placeholder="e.g. Book Club, Podcast" />
            </div>
          )}

          <div>
            <div className="flex gap-1 p-1 bg-muted rounded-lg mb-4 w-fit">
              <button
                onClick={() => setVoiceTab("record")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${voiceTab === "record" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                🎤 Record
              </button>
              <button
                onClick={() => setVoiceTab("upload")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${voiceTab === "upload" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                📁 Upload
              </button>
            </div>

            <AnimatePresence mode="wait">
              {voiceTab === "record" ? (
                <motion.div key="rec" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                  <p className="text-xs text-muted-foreground">Read a passage aloud — 30 seconds or more for best quality.</p>
                  {!audioBlob ? (
                    <Button
                      className={`w-full ${recording ? "bg-red-600 hover:bg-red-700 border-0 text-white" : "glow-primary"}`}
                      onClick={recording ? stopRecording : startRecording}
                    >
                      {recording ? <><span className="w-2 h-2 rounded-full bg-white animate-pulse mr-2" />Stop ({formatTime(recordingTime)})</> : "🎤 Start Recording"}
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <div className="bg-primary/10 border border-primary/20 rounded-lg p-2 text-sm text-primary">
                        ✓ Captured ({formatTime(recordingTime)})
                      </div>
                      <audio controls src={URL.createObjectURL(audioBlob)} className="w-full h-8" />
                      <Button variant="outline" className="w-full text-sm" onClick={() => { setAudioBlob(null); setRecordingTime(0); }}>
                        Re-record
                      </Button>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div key="upl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-5 text-center hover:border-primary/40 transition-colors cursor-pointer"
                    onClick={() => document.getElementById("add-voice-file")?.click()}
                  >
                    <div className="text-2xl mb-2">📁</div>
                    <p className="text-sm text-muted-foreground">{uploadedFile ? uploadedFile.name : "Click to upload audio"}</p>
                    <p className="text-xs text-muted-foreground mt-1">WAV, MP3, WebM</p>
                  </div>
                  <input id="add-voice-file" type="file" accept="audio/*" className="hidden" onChange={e => setUploadedFile(e.target.files?.[0] || null)} />
                  {uploadedFile && <audio controls src={URL.createObjectURL(uploadedFile)} className="w-full h-8" />}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Button
            className="w-full glow-primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? <><Spinner className="w-4 h-4 mr-2" />Cloning voice…</> : "Add to Voice Library"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
  const [addVoiceOpen, setAddVoiceOpen] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ["/api/users/profile"],
    queryFn: () => api.get("/api/users/profile").then(r => r.json()),
  });

  const { data: libraryData, isLoading: libraryLoading } = useQuery<VoiceLibraryEntry[]>({
    queryKey: ["/api/users/voice-library"],
    queryFn: () => api.get("/api/users/voice-library").then(r => r.json()),
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
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const cloneVoice = useMutation({
    mutationFn: async (files: File[]) => {
      if (files.length === 0) throw new Error("Please provide at least one voice sample.");
      const toDataUrl = (file: File | Blob): Promise<string> =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      const samples = await Promise.all(files.map(f => toDataUrl(f)));
      const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");
      const r = await fetch(`${BASE_URL}/api/users/voice-clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samples }),
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
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteLibraryEntry = useMutation({
    mutationFn: async (id: number) => {
      const r = await api.del(`/api/users/voice-library/${id}`);
      if (!r.ok && r.status !== 204) throw new Error(await r.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/voice-library"] });
      toast({ title: "Voice removed from library" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
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
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
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
    setRecordedBlobs(prev => [...prev, currentBlob]);
    setVoiceSamples(prev => [...prev, file]);
    setCurrentBlob(null);
    setRecordingTime(0);
    toast({ title: "Recording saved", description: `Sample ${recordedBlobs.length + 1} added.` });
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const library = libraryData || [];
  const groups = Array.from(new Set(library.map(e => e.group || "Other"))).sort();

  return (
    <div className="min-h-screen bg-background">
      <AppNav current="settings" />
      <main className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="font-serif text-3xl font-bold text-foreground mb-8">Settings</h1>

        {/* Profile */}
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
                <Input className="mt-1" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your display name" />
              </div>
              <div>
                <Label>Bio</Label>
                <Textarea className="mt-1" value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell us about yourself..." rows={3} />
              </div>
              <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending} className="glow-primary">
                {saveProfile.isPending ? <Spinner className="w-4 h-4 mr-2" /> : null}
                Save Profile
              </Button>
            </div>
          )}
        </section>

        {/* Voice Clone */}
        <section className="bg-card border border-border rounded-xl p-6 mb-6">
          <h2 className="font-serif text-xl font-semibold text-foreground mb-1">Voice Clone</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Provide voice samples to create a high-quality clone you can use in any audio drama. Aim for 30 seconds to 5 minutes of clear speech.
          </p>

          <div className="flex gap-1 p-1 bg-muted rounded-lg mb-5 w-fit">
            <button
              onClick={() => setVoiceTab("upload")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${voiceTab === "upload" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Upload Files
            </button>
            <button
              onClick={() => setVoiceTab("record")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${voiceTab === "record" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
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
                  {voiceSamples.length > 0 ? `${voiceSamples.length} file(s) selected` : "Click to select audio files"}
                </p>
                {voiceSamples.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {voiceSamples.map((f, i) => <p key={i} className="text-xs text-primary">{f.name}</p>)}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">WAV, MP3, WebM · Up to 5 files</p>
              </div>
              <input
                id="voice-file-input" type="file" accept="audio/*" multiple className="hidden"
                onChange={e => setVoiceSamples(Array.from(e.target.files || []))}
              />
              <Button onClick={() => cloneVoice.mutate(voiceSamples)} disabled={voiceSamples.length === 0 || cloneVoice.isPending} className="w-full glow-primary">
                {cloneVoice.isPending ? <Spinner className="w-4 h-4 mr-2" /> : null}
                Clone My Voice
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Read a passage of text aloud — a few sentences to a minute works best.</p>
              <div className="bg-muted rounded-xl p-5 flex flex-col items-center gap-4">
                <div className="flex items-center gap-1 h-10">
                  {Array.from({ length: 16 }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-1 rounded-full transition-all duration-150 ${recording ? "bg-primary" : "bg-border"}`}
                      style={{ height: recording ? `${20 + Math.sin((Date.now() / 200 + i) * 1.5) * 14}px` : "8px", animation: recording ? `pulse ${0.4 + i * 0.05}s ease-in-out infinite alternate` : "none" }}
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
                    <audio controls src={URL.createObjectURL(currentBlob)} className="h-8 mt-1" />
                  </div>
                )}
                <div className="flex gap-2 w-full">
                  {!recording ? (
                    <Button onClick={startRecording} className="flex-1" variant={currentBlob ? "outline" : "default"}>
                      {currentBlob ? "Re-record" : "Start Recording"}
                    </Button>
                  ) : (
                    <Button onClick={stopRecording} className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0">
                      ⏹ Stop
                    </Button>
                  )}
                  {currentBlob && !recording && (
                    <Button onClick={saveRecording} className="flex-1 glow-primary" disabled={recordedBlobs.length >= 5}>
                      Add Sample
                    </Button>
                  )}
                </div>
              </div>
              {recordedBlobs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">{recordedBlobs.length} sample(s) ready</p>
                  {recordedBlobs.map((blob, i) => (
                    <div key={i} className="flex items-center gap-3 bg-muted rounded-lg px-3 py-2">
                      <span className="text-primary text-xs font-mono">#{i + 1}</span>
                      <audio controls src={URL.createObjectURL(blob)} className="h-7 flex-1" />
                      <button
                        onClick={() => { setRecordedBlobs(prev => prev.filter((_, j) => j !== i)); setVoiceSamples(prev => prev.filter((_, j) => j !== i)); }}
                        className="text-muted-foreground hover:text-destructive text-xs transition-colors"
                      >✕</button>
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
                {voiceSamples.length > 0 ? `Clone My Voice (${voiceSamples.length} sample${voiceSamples.length > 1 ? "s" : ""})` : "Clone My Voice"}
              </Button>
            </div>
          )}
        </section>

        {/* Voice Library */}
        <section className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <h2 className="font-serif text-xl font-semibold text-foreground">My Voice Library</h2>
              {library.length > 0 && <Badge variant="secondary">{library.length} voice{library.length !== 1 ? "s" : ""}</Badge>}
            </div>
            <Button size="sm" variant="outline" onClick={() => setAddVoiceOpen(true)} className="text-xs border-primary/30 text-primary hover:bg-primary/10">
              + Add Voice
            </Button>
          </div>
          <p className="text-muted-foreground text-sm mb-5">
            Voices from friends who joined via invite links, or added manually. Use them to cast characters in any project.
          </p>

          {libraryLoading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : library.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-border rounded-xl">
              <div className="text-3xl mb-2">🎭</div>
              <p className="text-sm text-muted-foreground">No voices yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Add voices manually or invite friends to record theirs.</p>
              <Button size="sm" className="mt-4 glow-primary" onClick={() => setAddVoiceOpen(true)}>
                Add Your First Voice
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map(group => {
                const entries = library.filter(e => (e.group || "Other") === group);
                if (entries.length === 0) return null;
                return (
                  <div key={group}>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{group}</h3>
                    <div className="space-y-2">
                      {entries.map(entry => (
                        <VoiceCard key={entry.id} entry={entry} onDelete={id => deleteLibraryEntry.mutate(id)} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Account */}
        <section className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-serif text-xl font-semibold text-foreground mb-4">Account</h2>
          <Button variant="outline" onClick={() => { window.location.href = "/api/logout"; }} className="text-destructive border-destructive/30 hover:bg-destructive/10">
            Sign Out
          </Button>
        </section>
      </main>

      <AddVoiceModal
        open={addVoiceOpen}
        onClose={() => setAddVoiceOpen(false)}
        onAdded={() => queryClient.invalidateQueries({ queryKey: ["/api/users/voice-library"] })}
      />
    </div>
  );
}
