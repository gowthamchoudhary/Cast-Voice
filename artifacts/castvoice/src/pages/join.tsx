import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@workspace/replit-auth-web";
import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";

type InviteData = {
  invite: {
    id: number;
    projectId: number;
    characterId: string;
    uuid: string;
    voiceCloneId: string | null;
    filledByName: string | null;
  };
  character: {
    id: string;
    name: string;
    description: string;
  };
  storyTitle: string;
  inviterName: string;
  isFilled: boolean;
  filledByName: string | null;
};

export default function Join({ uuid }: { uuid: string }) {
  const api = useApi();
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("");
  const [group, setGroup] = useState("Friends");
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [voiceTab, setVoiceTab] = useState<"record" | "upload">("record");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: invite, isLoading: inviteLoading, error } = useQuery<InviteData>({
    queryKey: [`/api/invites/${uuid}`],
    queryFn: () =>
      api.get(`/api/invites/${uuid}`).then((r) => {
        if (!r.ok) throw new Error("Invite not found");
        return r.json();
      }),
    enabled: !!uuid,
  });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setAudioBlob(new Blob(chunks, { type: "audio/webm" }));
        setRecording(false);
        if (timerRef.current) clearInterval(timerRef.current);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordingTime(0);
      setAudioBlob(null);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      toast({ title: "Microphone error", description: "Could not access your microphone.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const toDataUrl = (blob: Blob | File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const submit = useMutation({
    mutationFn: async () => {
      const source = voiceTab === "upload" ? uploadedFile : audioBlob;
      if (!source) throw new Error("No audio provided");
      const name = displayName.trim() || user?.name || "Anonymous";
      const audioDataUrl = await toDataUrl(source);
      const r = await fetch(`${BASE_URL}/api/invites/${uuid}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          audioDataUrl,
          displayName: name,
          role: role.trim() || invite?.character.name || "",
          group: group.trim() || "Friends",
        }),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text);
      }
      return r.json();
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (e: Error) => {
      toast({ title: "Submission failed", description: e.message, variant: "destructive" });
    },
  });

  if (inviteLoading || authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center px-4">
        <div className="text-5xl mb-4">🔍</div>
        <h1 className="font-serif text-2xl font-bold text-foreground mb-2">Invite Not Found</h1>
        <p className="text-muted-foreground">This invite link may be expired or invalid.</p>
      </div>
    );
  }

  if (invite.isFilled && !submitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center px-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <div className="text-6xl mb-4">✅</div>
          <h1 className="font-serif text-2xl font-bold text-foreground mb-2">Already Filled!</h1>
          <p className="text-muted-foreground max-w-sm">
            {invite.filledByName ? `${invite.filledByName} has` : "Someone has"} already recorded a voice for{" "}
            <strong>{invite.character.name}</strong> in <strong>{invite.storyTitle}</strong>.
          </p>
        </motion.div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center px-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="font-serif text-2xl font-bold text-foreground mb-2">Voice Submitted!</h1>
          <p className="text-muted-foreground max-w-sm">
            Your voice has been cloned and added to <strong>{invite.inviterName}</strong>'s Voice Library as{" "}
            <strong>{invite.character.name}</strong>. They'll be notified and can use your voice in their audio drama.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-8">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-primary/5 blur-[80px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 max-w-md w-full"
      >
        {/* Invitation card */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-2xl shrink-0">
              🎭
            </div>
            <div>
              <p className="text-xs text-muted-foreground">You're invited by</p>
              <p className="font-semibold text-foreground">{invite.inviterName}</p>
            </div>
          </div>

          <h1 className="font-serif text-xl font-bold text-foreground mb-1">
            Voice <span className="text-primary">{invite.character.name}</span>
          </h1>
          <p className="text-sm text-muted-foreground mb-4">
            in <span className="text-foreground font-medium">{invite.storyTitle}</span>
          </p>

          <div className="bg-muted rounded-lg p-3 text-sm">
            <p className="text-xs text-muted-foreground mb-1">About this character</p>
            <p className="text-foreground leading-relaxed">{invite.character.description}</p>
          </div>
        </div>

        {/* Auth gate */}
        {!isAuthenticated ? (
          <div className="bg-card border border-border rounded-2xl p-6 text-center">
            <div className="text-3xl mb-3">🔐</div>
            <h2 className="font-serif text-lg font-semibold text-foreground mb-2">Sign in to continue</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Create a free account or sign in to submit your voice. It only takes a moment.
            </p>
            <Button
              className="w-full glow-primary"
              onClick={() => {
                window.location.href = `${BASE_URL}/api/auth/login?return_to=${encodeURIComponent(window.location.pathname)}`;
              }}
            >
              Sign in with Replit
            </Button>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-3 pb-4 border-b border-border">
              {user?.profileImage ? (
                <img src={user.profileImage} alt="" className="w-9 h-9 rounded-full border border-border" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                  {(user?.name || "U")[0]}
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-foreground">{user?.name}</p>
                <p className="text-xs text-muted-foreground">Signed in</p>
              </div>
            </div>

            {/* Name & tagging */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Your name <span className="text-muted-foreground text-xs">(saved to Voice Library)</span></Label>
                <Input
                  className="mt-1"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={user?.name || "Your name"}
                />
              </div>
              <div>
                <Label>Role / Character</Label>
                <Input
                  className="mt-1"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder={invite.character.name}
                />
              </div>
              <div>
                <Label>Group</Label>
                <Input
                  className="mt-1"
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                  placeholder="Friends"
                />
              </div>
            </div>

            {/* Voice input tabs */}
            <div>
              <div className="flex gap-1 p-1 bg-muted rounded-lg mb-4 w-fit">
                <button
                  onClick={() => setVoiceTab("record")}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    voiceTab === "record" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  🎤 Record
                </button>
                <button
                  onClick={() => setVoiceTab("upload")}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    voiceTab === "upload" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  📁 Upload
                </button>
              </div>

              <AnimatePresence mode="wait">
                {voiceTab === "record" ? (
                  <motion.div
                    key="record"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-3"
                  >
                    <p className="text-xs text-muted-foreground">
                      Read a passage of text aloud — at least 30 seconds for best quality.
                    </p>

                    {!audioBlob ? (
                      <Button
                        className={`w-full ${recording ? "bg-red-600 hover:bg-red-700 border-0 text-white" : "glow-primary"}`}
                        onClick={recording ? stopRecording : startRecording}
                      >
                        {recording ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-white animate-pulse mr-2" />
                            Stop Recording ({formatTime(recordingTime)})
                          </>
                        ) : (
                          <>🎤 Start Recording</>
                        )}
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-sm text-primary">
                          ✓ Recording captured ({formatTime(recordingTime)})
                        </div>
                        <audio controls src={URL.createObjectURL(audioBlob)} className="w-full h-8" />
                        <Button
                          variant="outline"
                          className="w-full text-sm"
                          onClick={() => { setAudioBlob(null); setRecordingTime(0); }}
                        >
                          Re-record
                        </Button>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="upload"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-3"
                  >
                    <div
                      className="border-2 border-dashed border-border rounded-lg p-5 text-center hover:border-primary/40 transition-colors cursor-pointer"
                      onClick={() => document.getElementById("join-voice-input")?.click()}
                    >
                      <div className="text-2xl mb-2">📁</div>
                      <p className="text-sm text-muted-foreground">
                        {uploadedFile ? uploadedFile.name : "Click to upload audio file"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">WAV, MP3, WebM · 30s or more recommended</p>
                    </div>
                    <input
                      id="join-voice-input"
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                    />
                    {uploadedFile && (
                      <audio controls src={URL.createObjectURL(uploadedFile)} className="w-full h-8" />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Button
              className="w-full glow-primary"
              onClick={() => submit.mutate()}
              disabled={
                submit.isPending ||
                (voiceTab === "record" ? !audioBlob : !uploadedFile)
              }
            >
              {submit.isPending ? (
                <>
                  <Spinner className="w-4 h-4 mr-2" />
                  Cloning your voice…
                </>
              ) : (
                "Submit My Voice"
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              By submitting, you consent to your voice being cloned and used in this audio drama production.
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center mt-4">
          Powered by <span className="text-primary">CastVoice</span>
        </p>
      </motion.div>
    </div>
  );
}
