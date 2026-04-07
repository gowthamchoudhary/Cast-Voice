import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
          <button onClick={() => setLocation("/settings")} className="hover:text-foreground transition-colors">Settings</button>
        </nav>
      </div>
    </header>
  );
}

type Character = {
  id: string;
  name: string;
  description: string;
};

type VoiceType = "ai_designed" | "user_clone" | "invite" | "library";

type Voice = {
  characterId: string;
  voiceType: VoiceType;
  elevenLabsVoiceId?: string;
  inviteName?: string;
  inviteEmail?: string;
  personName?: string;
};

type Project = {
  id: number;
  storyTitle: string;
  storyGenre: string;
  status: string;
  castJson?: { voices?: Record<string, Voice> };
  story?: {
    id: number;
    title: string;
    genre: string;
    synopsis: string;
    characters?: Character[];
    sceneImageUrl?: string;
  };
};

type VoiceDesign = {
  voice_id: string;
  name: string;
  gender: string;
  age: string;
  accent: string;
  style: string;
};

type VoiceLibraryEntry = {
  id: number;
  personName: string;
  role: string | null;
  group: string | null;
  elevenLabsVoiceId: string;
};

const GENDERS = ["male", "female", "neutral"];
const AGES = ["young", "middle_aged", "old"];
const ACCENTS = ["american", "british", "australian", "indian", "african", "neutral"];
const STYLES = ["narrative", "news", "conversational", "gruff", "warm", "mysterious", "cheerful"];

function LibraryVoiceCard({
  entry,
  onSelect,
}: {
  entry: VoiceLibraryEntry;
  onSelect: (entry: VoiceLibraryEntry) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

  const playPreview = async (e: React.MouseEvent) => {
    e.stopPropagation();
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
      audio.onerror = () => { setPlaying(false); setLoading(false); };
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
    <div
      onClick={() => onSelect(entry)}
      className="bg-card border border-border rounded-xl p-3 cursor-pointer hover:border-primary/40 transition-all group"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-serif font-bold text-xs shrink-0 group-hover:border-primary/50">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground text-sm truncate">{entry.personName}</p>
          {(entry.role || entry.group) && (
            <p className="text-xs text-muted-foreground truncate">
              {[entry.role, entry.group].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <button
          onClick={playPreview}
          disabled={loading}
          className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 shrink-0"
        >
          {loading ? <Spinner className="w-3 h-3" /> : playing ? <span className="text-xs">⏹</span> : <span className="text-xs">▶</span>}
        </button>
      </div>
    </div>
  );
}

export default function Cast({ projectId }: { projectId: string }) {
  const [, setLocation] = useLocation();
  const api = useApi();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeChar, setActiveChar] = useState<Character | null>(null);
  const [voiceType, setVoiceType] = useState<VoiceType>("ai_designed");
  const [gender, setGender] = useState("female");
  const [age, setAge] = useState("middle_aged");
  const [accent, setAccent] = useState("american");
  const [style, setStyle] = useState("narrative");
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [previewVoice, setPreviewVoice] = useState<VoiceDesign | null>(null);
  const [designedVoices, setDesignedVoices] = useState<Record<string, VoiceDesign>>({});
  const [castAssignments, setCastAssignments] = useState<Record<string, Voice>>({});

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
    queryFn: () => api.get(`/api/projects/${projectId}`).then((r) => r.json()),
  });

  const { data: voiceLibrary } = useQuery<VoiceLibraryEntry[]>({
    queryKey: ["/api/users/voice-library"],
    queryFn: () => api.get("/api/users/voice-library").then((r) => r.json()),
  });

  useEffect(() => {
    if (project?.castJson?.voices && Object.keys(castAssignments).length === 0) {
      setCastAssignments(project.castJson.voices as Record<string, Voice>);
    }
  }, [project]);

  const designVoice = useMutation({
    mutationFn: async () => {
      const r = await api.post("/api/voices/design", {
        gender, age, accent, style,
        description: activeChar?.description,
        characterName: activeChar?.name,
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<VoiceDesign>;
    },
    onSuccess: (voice) => setPreviewVoice(voice),
    onError: (e: Error) => {
      toast({ title: "Error designing voice", description: e.message, variant: "destructive" });
    },
  });

  const saveVoice = useMutation({
    mutationFn: async () => {
      if (!activeChar) return;
      const updated = {
        ...castAssignments,
        [activeChar.id]: {
          characterId: activeChar.id,
          voiceType,
          elevenLabsVoiceId: previewVoice?.voice_id,
        },
      };
      const r = await api.patch(`/api/projects/${projectId}`, { castJson: { voices: updated } });
      if (!r.ok) throw new Error(await r.text());
      return updated;
    },
    onSuccess: (updated) => {
      if (updated) {
        if (previewVoice && activeChar) {
          setDesignedVoices((prev) => ({ ...prev, [activeChar.id]: previewVoice }));
        }
        setCastAssignments(updated);
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
        toast({ title: "Voice saved!", description: `Voice assigned to ${activeChar?.name}` });
        setActiveChar(null);
        setPreviewVoice(null);
      }
    },
    onError: (e: Error) => {
      toast({ title: "Error saving", description: e.message, variant: "destructive" });
    },
  });

  const sendInvite = useMutation({
    mutationFn: async () => {
      if (!activeChar) return;
      const r = await api.post("/api/invites", {
        projectId: Number(projectId),
        characterId: activeChar.id,
        characterName: activeChar.name,
        recipientName: inviteName,
        recipientEmail: inviteEmail,
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (invite) => {
      const inviteUrl = `${window.location.origin}/join/${invite.uuid}`;
      toast({
        title: "Invite link created!",
        description: `Share: ${inviteUrl}`,
      });
      if (navigator.clipboard) {
        navigator.clipboard.writeText(inviteUrl).catch(() => {});
      }
      const updated = {
        ...castAssignments,
        [activeChar!.id]: {
          characterId: activeChar!.id,
          voiceType: "invite" as const,
          inviteName,
          inviteEmail,
        },
      };
      setCastAssignments(updated);
      api.patch(`/api/projects/${projectId}`, { castJson: { voices: updated } });
      setActiveChar(null);
    },
    onError: (e: Error) => {
      toast({ title: "Error creating invite", description: e.message, variant: "destructive" });
    },
  });

  const assignFromLibrary = async (entry: VoiceLibraryEntry) => {
    if (!activeChar) return;
    const updated = {
      ...castAssignments,
      [activeChar.id]: {
        characterId: activeChar.id,
        voiceType: "library" as const,
        elevenLabsVoiceId: entry.elevenLabsVoiceId,
        personName: entry.personName,
      },
    };
    await api.patch(`/api/projects/${projectId}`, { castJson: { voices: updated } });
    setCastAssignments(updated);
    queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
    toast({ title: "Voice assigned!", description: `${entry.personName}'s voice assigned to ${activeChar.name}` });
    setActiveChar(null);
  };

  const startGeneration = useMutation({
    mutationFn: async () => {
      const r = await api.post(`/api/projects/${projectId}/generate`, {});
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => setLocation(`/generate/${projectId}`),
    onError: (e: Error) => {
      toast({ title: "Error starting generation", description: e.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const characters = project?.story?.characters || [];
  const castCount = Object.keys(castAssignments).length;
  const allCast = castCount >= characters.length && characters.length > 0;
  const library = voiceLibrary || [];
  const libraryGroups = Array.from(new Set(library.map(e => e.group || "Other"))).sort();

  const getVoiceLabel = (v: Voice) => {
    if (v.voiceType === "ai_designed") return "AI Voice";
    if (v.voiceType === "invite") return `Invited: ${v.inviteName || "Friend"}`;
    if (v.voiceType === "library") return v.personName || "Library";
    return "My Voice";
  };

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-start gap-6 mb-10">
          {project?.story?.sceneImageUrl && (
            <img
              src={project.story.sceneImageUrl}
              alt={project.story.title}
              className="w-32 h-20 rounded-lg object-cover border border-border shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <Badge variant="secondary">{project?.story?.genre ?? project?.storyGenre}</Badge>
              <span className="text-muted-foreground text-sm">{castCount}/{characters.length} cast</span>
            </div>
            <h1 className="font-serif text-2xl font-bold text-foreground">{project?.story?.title ?? project?.storyTitle}</h1>
            <p className="text-muted-foreground text-sm mt-1 line-clamp-2">{project?.story?.synopsis ?? "Cast each character with a voice to generate your audio drama."}</p>
          </div>
          <Button
            className="shrink-0 glow-primary"
            disabled={!allCast || startGeneration.isPending}
            onClick={() => startGeneration.mutate()}
          >
            {startGeneration.isPending ? <Spinner className="w-4 h-4 mr-2" /> : null}
            Generate Drama
          </Button>
        </div>

        <div className="mb-4">
          <h2 className="font-serif text-xl font-semibold text-foreground mb-1">Cast Characters</h2>
          <p className="text-muted-foreground text-sm mb-6">Assign a voice to each character. Use AI voices, your own voice, invite friends, or pick from your Voice Library.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {characters.map((char, i) => {
            const assigned = castAssignments[char.id];
            const voiceDesigned = designedVoices[char.id];
            return (
              <motion.div
                key={char.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className={`bg-card border rounded-xl p-5 cursor-pointer transition-all hover:border-primary/40 ${
                  assigned ? "border-primary/30" : "border-border"
                }`}
                onClick={() => {
                  setActiveChar(char);
                  setPreviewVoice(assigned?.elevenLabsVoiceId && voiceDesigned ? voiceDesigned : null);
                  setVoiceType(assigned?.voiceType || "ai_designed");
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-serif font-bold text-sm shrink-0">
                    {char.name[0]}
                  </div>
                  {assigned && (
                    <Badge variant="outline" className="text-xs border-primary/40 text-primary">
                      {getVoiceLabel(assigned)}
                    </Badge>
                  )}
                </div>
                <h3 className="font-serif text-base font-semibold text-foreground mb-1">{char.name}</h3>
                <p className="text-muted-foreground text-xs leading-relaxed line-clamp-3">{char.description}</p>
                {!assigned && (
                  <Button variant="outline" size="sm" className="mt-3 w-full text-xs">
                    Assign Voice
                  </Button>
                )}
              </motion.div>
            );
          })}
        </div>
      </main>

      {/* Cast Dialog */}
      <Dialog open={!!activeChar} onOpenChange={(open) => { if (!open) { setActiveChar(null); setPreviewVoice(null); } }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg">{activeChar?.name}</DialogTitle>
            <DialogDescription className="text-xs">{activeChar?.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Voice Type</Label>
              <Select value={voiceType} onValueChange={(v) => setVoiceType(v as VoiceType)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ai_designed">AI-Designed Voice</SelectItem>
                  <SelectItem value="user_clone">My Voice (Cloned)</SelectItem>
                  <SelectItem value="invite">Invite a Friend</SelectItem>
                  <SelectItem value="library">From My Library</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {voiceType === "ai_designed" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Gender</Label>
                    <Select value={gender} onValueChange={setGender}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {GENDERS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Age</Label>
                    <Select value={age} onValueChange={setAge}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AGES.map((a) => <SelectItem key={a} value={a}>{a.replace("_", " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Accent</Label>
                    <Select value={accent} onValueChange={setAccent}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACCENTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Style</Label>
                    <Select value={style} onValueChange={setStyle}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STYLES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => designVoice.mutate()} disabled={designVoice.isPending}>
                    {designVoice.isPending ? <Spinner className="w-4 h-4 mr-2" /> : null}
                    Design Voice
                  </Button>
                  {previewVoice && (
                    <Button className="flex-1 glow-primary" onClick={() => saveVoice.mutate()} disabled={saveVoice.isPending}>
                      {saveVoice.isPending ? <Spinner className="w-4 h-4 mr-2" /> : null}
                      Use This Voice
                    </Button>
                  )}
                </div>
                {previewVoice && (
                  <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-sm">
                    <p className="text-primary font-medium mb-1">Voice designed: {previewVoice.name}</p>
                    <p className="text-muted-foreground text-xs">{previewVoice.gender} · {previewVoice.age} · {previewVoice.accent} · {previewVoice.style}</p>
                  </div>
                )}
              </div>
            )}

            {voiceType === "user_clone" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Your cloned voice (configured in Settings) will be used for this character.</p>
                <Button
                  className="w-full glow-primary"
                  onClick={async () => {
                    if (!activeChar) return;
                    const updated = {
                      ...castAssignments,
                      [activeChar.id]: { characterId: activeChar.id, voiceType: "user_clone" as const },
                    };
                    await api.patch(`/api/projects/${projectId}`, { castJson: { voices: updated } });
                    setCastAssignments(updated);
                    toast({ title: "Voice saved!", description: `Your voice assigned to ${activeChar.name}` });
                    setActiveChar(null);
                  }}
                >
                  Use My Cloned Voice
                </Button>
              </div>
            )}

            {voiceType === "invite" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Send a link to a friend to record their voice for this character.</p>
                <div>
                  <Label>Friend's Name</Label>
                  <Input className="mt-1" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Alex" />
                </div>
                <div>
                  <Label>Email (optional)</Label>
                  <Input className="mt-1" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="alex@example.com" type="email" />
                </div>
                <Button
                  className="w-full glow-primary"
                  onClick={() => sendInvite.mutate()}
                  disabled={!inviteName || sendInvite.isPending}
                >
                  {sendInvite.isPending ? <Spinner className="w-4 h-4 mr-2" /> : null}
                  Create Invite Link & Copy
                </Button>
              </div>
            )}

            {voiceType === "library" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Pick a voice from your library to assign to this character.</p>
                {library.length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-border rounded-xl">
                    <div className="text-2xl mb-2">🎭</div>
                    <p className="text-sm text-muted-foreground">Your library is empty.</p>
                    <p className="text-xs text-muted-foreground mt-1">Invite friends to fill characters and their voices will appear here.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {libraryGroups.map((group) => {
                      const entries = library.filter(e => (e.group || "Other") === group);
                      if (entries.length === 0) return null;
                      return (
                        <div key={group}>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group}</p>
                          <div className="space-y-2">
                            {entries.map((entry) => (
                              <LibraryVoiceCard key={entry.id} entry={entry} onSelect={assignFromLibrary} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
