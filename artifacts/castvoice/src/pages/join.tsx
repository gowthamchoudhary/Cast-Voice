import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";

export default function Join({ uuid }: { uuid: string }) {
  const api = useApi();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const { data: invite, isLoading, error } = useQuery({
    queryKey: [`/api/invites/${uuid}`],
    queryFn: () => api.get(`/api/invites/${uuid}`).then((r) => {
      if (!r.ok) throw new Error("Invite not found");
      return r.json();
    }),
    enabled: !!uuid,
  });

  const inv = invite as any;

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = () => {
        setAudioBlob(new Blob(chunks, { type: "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      setMediaRecorder(mr);
      setRecording(true);
    } catch {
      toast({ title: "Error", description: "Could not access microphone.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    mediaRecorder?.stop();
    setRecording(false);
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!audioBlob) throw new Error("No recording");
      const formData = new FormData();
      formData.append("samples", new File([audioBlob], "recording.webm", { type: "audio/webm" }));
      const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");
      const r = await fetch(`${BASE_URL}/api/invites/${uuid}/submit`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({ title: "Voice submitted!", description: "Your voice has been added to the drama." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error || !inv) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center px-4">
        <div className="text-5xl mb-4">🔍</div>
        <h1 className="font-serif text-2xl font-bold text-foreground mb-2">Invite Not Found</h1>
        <p className="text-muted-foreground">This invite link may be expired or invalid.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center px-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="font-serif text-2xl font-bold text-foreground mb-2">Voice Submitted!</h1>
          <p className="text-muted-foreground max-w-sm">
            Your voice has been added to <strong>{inv.project?.title || "the drama"}</strong>. The creator will include it in the final production.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-primary/5 blur-[80px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 max-w-md w-full text-center"
      >
        <div className="bg-card border border-border rounded-2xl p-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-2xl text-primary mx-auto mb-4">
            🎭
          </div>

          <h1 className="font-serif text-2xl font-bold text-foreground mb-1">You've been invited!</h1>
          <p className="text-muted-foreground text-sm mb-6">
            <strong className="text-foreground">{inv.project?.title || "An audio drama"}</strong> needs your voice for the character{" "}
            <strong className="text-primary">{inv.characterName}</strong>.
          </p>

          <div className="bg-muted rounded-lg p-4 mb-6 text-left">
            <p className="text-xs text-muted-foreground mb-1">Character</p>
            <p className="font-serif text-lg font-semibold text-foreground">{inv.characterName}</p>
          </div>

          <div className="space-y-3">
            {!audioBlob ? (
              <Button
                className={`w-full ${recording ? "bg-destructive hover:bg-destructive/90" : "glow-primary"}`}
                onClick={recording ? stopRecording : startRecording}
              >
                {recording ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse mr-2" />
                    Stop Recording
                  </>
                ) : (
                  <>🎤 Start Recording</>
                )}
              </Button>
            ) : (
              <>
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-sm text-primary">
                  ✓ Recording captured! Ready to submit.
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setAudioBlob(null)}
                  >
                    Re-record
                  </Button>
                  <Button
                    className="flex-1 glow-primary"
                    onClick={() => submit.mutate()}
                    disabled={submit.isPending}
                  >
                    {submit.isPending ? <Spinner className="w-4 h-4 mr-2" /> : null}
                    Submit Voice
                  </Button>
                </div>
              </>
            )}
          </div>

          <p className="text-xs text-muted-foreground mt-6">
            By submitting, you consent to your voice being used in this audio drama production.
          </p>
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          Powered by <span className="text-primary">CastVoice</span>
        </p>
      </motion.div>
    </div>
  );
}
