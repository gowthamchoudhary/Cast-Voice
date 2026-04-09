import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
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
import { Textarea } from "@/components/ui/textarea";
import { AppNav } from "@/components/app-nav";

type Character = { id: string; name: string; description: string };
type VoiceType = "ai_designed" | "user_clone" | "invite" | "library";
type Voice = {
  characterId: string;
  voiceType: VoiceType;
  elevenLabsVoiceId?: string;
  description?: string;
  inviteName?: string;
  inviteEmail?: string;
  inviteUuid?: string;
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
type VoiceLibraryEntry = {
  id: number;
  personName: string;
  role: string | null;
  group: string | null;
  elevenLabsVoiceId: string;
};
type UserProfile = { voiceCloneId?: string | null; displayName?: string };

const VOICE_CHIPS = [
  { label: "Deep Baritone", desc: "Deep, gravelly baritone voice with commanding authority" },
  { label: "Warm Feminine", desc: "Warm, gentle feminine voice with nurturing compassion" },
  { label: "Young Energetic", desc: "Young, enthusiastic voice full of energy and excitement" },
  { label: "Mysterious", desc: "Ethereal, mysterious voice with subtle intrigue" },
  { label: "Villainous", desc: "Cold, menacing villainous voice with sinister undertones" },
  { label: "Childlike", desc: "Innocent, curious childlike voice, soft and wide-eyed" },
  { label: "Elderly Wise", desc: "Seasoned elderly voice with warmth, wisdom and gravitas" },
  { label: "Robotic", desc: "Synthetic robotic voice with precise digital cadence" },
  { label: "Gruff Soldier", desc: "Tough, battle-hardened soldier voice, gruff and direct" },
  { label: "Playful Comic", desc: "Bright, playful comedic voice with infectious energy" },
];

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
            <p className="text-xs text-muted-foreground truncate">{[entry.role, entry.group].filter(Boolean).join(" · ")}</p>
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

function CastDialog({
  char,
  profile,
  library,
  projectId,
  castAssignments,
  setCastAssignments,
  onClose,
}: {
  char: Character;
  profile: UserProfile | null;
  library: VoiceLibraryEntry[];
  projectId: string;
  castAssignments: Record<string, Voice>;
  setCastAssignments: React.Dispatch<React.SetStateAction<Record<string, Voice>>>;
  onClose: () => void;
}) {
  const api = useApi();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const existing = castAssignments[char.id];
  const [activeTab, setActiveTab] = useState<VoiceType>(existing?.voiceType || "ai_designed");

  // AI Generate state
  const [description, setDescription] = useState(existing?.voiceType === "ai_designed" ? (existing.description || "") : "");
  const [designedVoiceId, setDesignedVoiceId] = useState<string | null>(existing?.voiceType === "ai_designed" ? (existing.elevenLabsVoiceId || null) : null);
  const [designing, setDesigning] = useState(false);

  // Invite state
  const [inviteName, setInviteName] = useState(existing?.inviteName || "");
  const [inviteEmail, setInviteEmail] = useState(existing?.inviteEmail || "");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteUuid, setInviteUuid] = useState<string | null>(existing?.inviteUuid || null);
  const [inviteFilled, setInviteFilled] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [saving, setSaving] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

  const libraryGroups = Array.from(new Set(library.map(e => e.group || "Other"))).sort();

  const saveVoice = async (voice: Voice) => {
    setSaving(true);
    try {
      const updated = { ...castAssignments, [char.id]: voice };
      const r = await api.patch(`/api/projects/${projectId}`, { castJson: { voices: updated } });
      if (!r.ok) throw new Error(await r.text());
      setCastAssignments(updated);
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      toast({ title: "Voice saved!", description: `Voice assigned to ${char.name}` });
      onClose();
    } catch (e: unknown) {
      toast({ title: "Error saving", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDesignVoice = async () => {
    if (!description.trim()) { toast({ title: "Add a description first", variant: "destructive" }); return; }
    setDesigning(true);
    setDesignedVoiceId(null);
    try {
      const r = await api.post("/api/voices/design", { description, characterName: char.name });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as { voiceId: string };
      setDesignedVoiceId(data.voiceId);
      toast({ title: "Voice designed!", description: "Ready to use. Click 'Use This Voice' to assign it." });
    } catch (e: unknown) {
      toast({ title: "Voice design failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally {
      setDesigning(false);
    }
  };

  const handleCreateInvite = async () => {
    if (!inviteName.trim()) { toast({ title: "Enter recipient's name", variant: "destructive" }); return; }
    setSendingInvite(true);
    try {
      const r = await api.post("/api/invites", {
        projectId: Number(projectId),
        characterId: char.id,
        characterName: char.name,
        recipientName: inviteName,
        recipientEmail: inviteEmail,
      });
      if (!r.ok) throw new Error(await r.text());
      const invite = await r.json() as { uuid: string };
      const link = `${window.location.origin}/join/${invite.uuid}`;
      setInviteLink(link);
      setInviteUuid(invite.uuid);
      startPolling(invite.uuid);
      const updated = {
        ...castAssignments,
        [char.id]: { characterId: char.id, voiceType: "invite" as const, inviteName, inviteEmail, inviteUuid: invite.uuid },
      };
      setCastAssignments(updated);
      api.patch(`/api/projects/${projectId}`, { castJson: { voices: updated } });
    } catch (e: unknown) {
      toast({ title: "Failed to create invite", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally {
      setSendingInvite(false);
    }
  };

  const startPolling = useCallback((uuid: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await api.get(`/api/invites/${uuid}`);
        if (r.ok) {
          const data = await r.json() as { isFilled: boolean; filledByName?: string };
          if (data.isFilled) {
            setInviteFilled(true);
            if (pollRef.current) clearInterval(pollRef.current);
            toast({ title: "Voice submitted!", description: `${data.filledByName || inviteName} has recorded their voice for ${char.name}!` });
          }
        }
      } catch {
        // silent
      }
    }, 10000);
  }, [api, char.name, inviteName, toast]);

  useEffect(() => {
    if (inviteUuid && !inviteFilled && !inviteLink) {
      const link = `${window.location.origin}/join/${inviteUuid}`;
      setInviteLink(link);
      startPolling(inviteUuid);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const copyLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => {
      toast({ title: "Link copied!", description: "Share it with your friend." });
    });
  };

  const whatsappShare = () => {
    if (!inviteLink) return;
    const text = encodeURIComponent(`Hey! I'm making an audio drama called "${char.name}" and want you to voice a character. Click here to record your voice: ${inviteLink}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const TABS: { id: VoiceType; label: string; emoji: string }[] = [
    { id: "user_clone", label: "My Voice", emoji: "🎙" },
    { id: "library", label: "Library", emoji: "📚" },
    { id: "ai_designed", label: "AI Generate", emoji: "✨" },
    { id: "invite", label: "Invite Friend", emoji: "🔗" },
  ];

  const showCloningBanner = activeTab === "user_clone" || activeTab === "library" || activeTab === "invite";

  return (
    <div className="space-y-4">
      {/* Voice Cloning Coming Soon banner */}
      {showCloningBanner && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5">
          <span className="text-amber-500 text-sm mt-0.5">🎙️</span>
          <div>
            <p className="text-xs font-semibold text-amber-500">Voice Cloning Coming Soon</p>
            <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
              Your voice is saved. We're launching cloning with studio subscriptions soon.
              Your character will be voiced with a matching AI voice for now.
            </p>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-border">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="mr-1">{tab.emoji}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* MY VOICE TAB */}
        {activeTab === "user_clone" && (
          <motion.div key="my_voice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            {profile?.voiceCloneId ? (
              <>
                <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-xl p-4">
                  <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary text-lg shrink-0">🎙</div>
                  <div>
                    <p className="font-medium text-foreground text-sm">Your Cloned Voice</p>
                    <p className="text-xs text-muted-foreground">Set up in Settings · Ready to use</p>
                  </div>
                  <div className="ml-auto w-2 h-2 rounded-full bg-green-500" />
                </div>
                <Button
                  className="w-full glow-primary"
                  onClick={() => saveVoice({ characterId: char.id, voiceType: "user_clone", elevenLabsVoiceId: profile.voiceCloneId! })}
                  disabled={saving}
                >
                  {saving ? <Spinner className="w-4 h-4 mr-2" /> : null}
                  Use My Cloned Voice
                </Button>
              </>
            ) : (
              <div className="text-center py-8 border border-dashed border-border rounded-xl">
                <div className="text-3xl mb-2">🎙</div>
                <p className="text-sm text-foreground mb-1">No voice clone yet</p>
                <p className="text-xs text-muted-foreground mb-4">Go to Settings to record your voice and create a clone.</p>
                <Button variant="outline" size="sm" onClick={() => { window.location.href = "/settings"; }}>
                  Set Up Voice Clone
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {/* LIBRARY TAB */}
        {activeTab === "library" && (
          <motion.div key="library" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            {library.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-border rounded-xl">
                <div className="text-2xl mb-2">📚</div>
                <p className="text-sm text-muted-foreground">Your library is empty.</p>
                <p className="text-xs text-muted-foreground mt-1">Invite friends to fill characters — their clones appear here.</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-64 overflow-y-auto pr-1">
                {libraryGroups.map(group => {
                  const entries = library.filter(e => (e.group || "Other") === group);
                  if (entries.length === 0) return null;
                  return (
                    <div key={group}>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group}</p>
                      <div className="space-y-2">
                        {entries.map(entry => (
                          <LibraryVoiceCard
                            key={entry.id}
                            entry={entry}
                            onSelect={async (e) => {
                              await saveVoice({ characterId: char.id, voiceType: "library", elevenLabsVoiceId: e.elevenLabsVoiceId, personName: e.personName });
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* AI GENERATE TAB */}
        {activeTab === "ai_designed" && (
          <motion.div key="ai_designed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Quick Presets</Label>
              <div className="flex flex-wrap gap-1.5">
                {VOICE_CHIPS.map(chip => (
                  <button
                    key={chip.label}
                    onClick={() => setDescription(chip.desc)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      description === chip.desc
                        ? "bg-primary/20 border-primary text-primary"
                        : "bg-muted border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Voice Description</Label>
              <Textarea
                className="mt-1 text-sm resize-none"
                rows={3}
                value={description}
                onChange={e => { setDescription(e.target.value); setDesignedVoiceId(null); }}
                placeholder="Describe the voice: e.g. 'Deep, gravelly baritone with commanding authority and slight British accent'"
              />
            </div>

            {designedVoiceId && (
              <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg p-3 text-sm text-primary">
                <span className="text-base">✓</span>
                <span>Voice designed and ready to assign</span>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleDesignVoice}
                disabled={designing || !description.trim()}
              >
                {designing ? <Spinner className="w-4 h-4 mr-2" /> : null}
                {designing ? "Designing..." : "Design Voice"}
              </Button>
              {designedVoiceId && (
                <Button
                  className="flex-1 glow-primary"
                  onClick={() => saveVoice({ characterId: char.id, voiceType: "ai_designed", elevenLabsVoiceId: designedVoiceId, description })}
                  disabled={saving}
                >
                  {saving ? <Spinner className="w-4 h-4 mr-2" /> : null}
                  Use This Voice
                </Button>
              )}
            </div>
          </motion.div>
        )}

        {/* INVITE FRIEND TAB */}
        {activeTab === "invite" && (
          <motion.div key="invite" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            {!inviteLink ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Send a link to a friend so they can record their voice for <strong>{char.name}</strong>. Their voice will be cloned and added to your library.
                </p>
                <div>
                  <Label>Friend's Name</Label>
                  <Input className="mt-1" value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Alex" />
                </div>
                <div>
                  <Label>Email <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input className="mt-1" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="alex@example.com" type="email" />
                </div>
                <Button
                  className="w-full glow-primary"
                  onClick={handleCreateInvite}
                  disabled={!inviteName.trim() || sendingInvite}
                >
                  {sendingInvite ? <><Spinner className="w-4 h-4 mr-2" />Creating link…</> : "Create Invite Link"}
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                {inviteFilled ? (
                  <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                    <span className="text-2xl">🎉</span>
                    <div>
                      <p className="font-medium text-foreground text-sm">Voice submitted!</p>
                      <p className="text-xs text-muted-foreground">{inviteName}'s voice is in your library and ready to use.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 bg-muted rounded-xl p-4">
                    <Spinner className="w-4 h-4 shrink-0" />
                    <div>
                      <p className="font-medium text-foreground text-sm">Waiting for {inviteName}…</p>
                      <p className="text-xs text-muted-foreground">We'll notify you when they record their voice.</p>
                    </div>
                  </div>
                )}

                <div>
                  <Label className="text-xs text-muted-foreground">Invite Link</Label>
                  <div className="mt-1 flex gap-2">
                    <Input value={inviteLink} readOnly className="text-xs font-mono flex-1 bg-muted" />
                    <Button variant="outline" size="sm" onClick={copyLink}>Copy</Button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={copyLink}>
                    📋 Copy Link
                  </Button>
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white border-0"
                    onClick={whatsappShare}
                  >
                    💬 WhatsApp
                  </Button>
                </div>

                {inviteFilled && (
                  <Button
                    className="w-full glow-primary"
                    onClick={onClose}
                  >
                    Done
                  </Button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Cast({ projectId }: { projectId: string }) {
  const [, setLocation] = useLocation();
  const api = useApi();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeChar, setActiveChar] = useState<Character | null>(null);
  const [castAssignments, setCastAssignments] = useState<Record<string, Voice>>({});

  // Poll every 15s if any invite is still waiting for a voice submission
  const hasWaitingInvites = Object.values(castAssignments).some(
    (v) => v.voiceType === "invite" && !v.elevenLabsVoiceId
  );

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
    queryFn: () => api.get(`/api/projects/${projectId}`).then(r => r.json()),
    refetchInterval: hasWaitingInvites ? 15000 : false,
  });

  const { data: voiceLibrary } = useQuery<VoiceLibraryEntry[]>({
    queryKey: ["/api/users/voice-library"],
    queryFn: () => api.get("/api/users/voice-library").then(r => r.json()),
  });

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/users/profile"],
    queryFn: () => api.get("/api/users/profile").then(r => r.json()),
  });

  useEffect(() => {
    if (!project?.castJson?.voices) return;
    const incoming = project.castJson.voices as Record<string, Voice>;
    // Merge: keep local state but upgrade any invite entries that now have a voice ID
    setCastAssignments((prev) => {
      const merged = { ...prev };
      for (const [charId, voice] of Object.entries(incoming)) {
        const existing = merged[charId];
        // Always sync when: no local entry, or incoming has a voiceId we don't have yet
        if (!existing || (voice.elevenLabsVoiceId && !existing.elevenLabsVoiceId)) {
          merged[charId] = voice;
        }
      }
      return merged;
    });
  }, [project]);

  const startGeneration = useMutation({
    mutationFn: async () => {
      const r = await api.post(`/api/projects/${projectId}/generate`, {});
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => setLocation(`/generate/${projectId}`),
    onError: (e: Error) => toast({ title: "Error starting generation", description: e.message, variant: "destructive" }),
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

  const getVoiceLabel = (v: Voice) => {
    if (v.voiceType === "ai_designed") return "AI Voice";
    if (v.voiceType === "invite") {
      return v.elevenLabsVoiceId
        ? `Voice Received ✓`
        : `Waiting: ${v.inviteName || "Friend"}`;
    }
    if (v.voiceType === "library") return v.personName || "Library";
    return "My Voice";
  };

  const getVoiceEmoji = (v: Voice) => {
    if (v.voiceType === "ai_designed") return "✨";
    if (v.voiceType === "invite") return v.elevenLabsVoiceId ? "✅" : "⏳";
    if (v.voiceType === "library") return "📚";
    return "🎙";
  };

  return (
    <div className="min-h-screen bg-background">
      <AppNav current="other" showUser={false} />
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

        <div className="mb-6">
          <h2 className="font-serif text-xl font-semibold text-foreground mb-1">Cast Characters</h2>
          <p className="text-muted-foreground text-sm">Click a character to assign a voice using AI, your own voice, a friend's voice, or your Voice Library.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {characters.map((char, i) => {
            const assigned = castAssignments[char.id];
            return (
              <motion.div
                key={char.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className={`bg-card border rounded-xl p-5 cursor-pointer transition-all hover:border-primary/40 ${
                  assigned ? "border-primary/30" : "border-border"
                }`}
                onClick={() => setActiveChar(char)}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-serif font-bold text-sm shrink-0">
                    {char.name[0]}
                  </div>
                  {assigned && (
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        assigned.voiceType === "invite" && !assigned.elevenLabsVoiceId
                          ? "border-amber-500/40 text-amber-500"
                          : "border-primary/40 text-primary"
                      }`}
                    >
                      {getVoiceEmoji(assigned)} {getVoiceLabel(assigned)}
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

      <Dialog open={!!activeChar} onOpenChange={open => { if (!open) setActiveChar(null); }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg">{activeChar?.name}</DialogTitle>
            <DialogDescription className="text-xs line-clamp-2">{activeChar?.description}</DialogDescription>
          </DialogHeader>

          {activeChar && (
            <CastDialog
              char={activeChar}
              profile={profile || null}
              library={library}
              projectId={projectId}
              castAssignments={castAssignments}
              setCastAssignments={setCastAssignments}
              onClose={() => setActiveChar(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
