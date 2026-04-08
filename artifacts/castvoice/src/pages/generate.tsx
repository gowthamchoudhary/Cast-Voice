import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useApi } from "@/hooks/use-api";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";

function Nav() {
  const [, setLocation] = useLocation();
  return (
    <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <button onClick={() => setLocation("/dashboard")} className="font-serif text-xl font-bold text-foreground">
          Cast<span className="text-primary">Voice</span>
        </button>
      </div>
    </header>
  );
}

const STAGES = [
  { label: "Designing character voices", maxProgress: 25 },
  { label: "Recording dialogue lines", maxProgress: 82 },
  { label: "Generating scene imagery", maxProgress: 88 },
  { label: "Mixing final audio", maxProgress: 98 },
  { label: "Drama ready!", maxProgress: 100 },
];

export default function Generate({ projectId }: { projectId: string }) {
  const [, setLocation] = useLocation();
  const api = useApi();

  const { data: status } = useQuery({
    queryKey: [`/api/projects/${projectId}/status`],
    queryFn: () => api.get(`/api/projects/${projectId}/status`).then((r) => r.json()),
    refetchInterval: (query) => {
      const s = query.state.data as any;
      if (s?.status === "ready" || s?.status === "failed") return false;
      return 2000;
    },
  });

  useEffect(() => {
    if ((status as any)?.status === "ready") {
      setTimeout(() => setLocation(`/play/${projectId}`), 1000);
    }
  }, [(status as any)?.status, projectId, setLocation]);

  const progress = (status as any)?.progress ?? 0;
  const currentStep = (status as any)?.currentStep as string | undefined;
  const isFailed = (status as any)?.status === "failed";

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="max-w-2xl mx-auto px-6 py-20 flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full"
        >
          {isFailed ? (
            <div>
              <div className="text-5xl mb-4">⚠️</div>
              <h1 className="font-serif text-2xl font-bold text-destructive mb-2">Generation Failed</h1>
              <p className="text-muted-foreground mb-6">{(status as any)?.error || currentStep || "Something went wrong during generation."}</p>
              <button
                className="text-primary underline text-sm"
                onClick={() => setLocation(`/cast/${projectId}`)}
              >
                Go back to casting
              </button>
            </div>
          ) : (
            <div>
              {/* Animated record icon */}
              <div className="relative w-24 h-24 mx-auto mb-8">
                <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
                <div className="absolute inset-2 rounded-full border-2 border-primary/40 animate-ping" style={{ animationDelay: "0.3s" }} />
                <div className="w-24 h-24 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-3xl">
                  🎙️
                </div>
              </div>

              <h1 className="font-serif text-3xl font-bold text-foreground mb-2">Producing Your Drama</h1>
              <p className="text-muted-foreground mb-8">
                Our AI is hard at work bringing your story to life.
              </p>

              <div className="w-full mb-2">
                <Progress value={progress} className="h-2" />
              </div>

              {/* Live current step label */}
              {currentStep && (
                <p className="text-sm text-primary font-medium mb-6 min-h-[1.5rem] transition-all">
                  {currentStep}
                </p>
              )}

              <div className="space-y-2 mt-4">
                {STAGES.map((stage, i) => {
                  const stageMin = i === 0 ? 0 : STAGES[i - 1].maxProgress;
                  const done = progress >= stage.maxProgress;
                  const active = !done && progress >= stageMin;
                  return (
                    <div
                      key={stage.label}
                      className={`flex items-center gap-3 text-sm px-4 py-2 rounded-lg transition-colors ${
                        active ? "bg-primary/10 text-primary" : done ? "text-muted-foreground/50" : "text-muted-foreground/30"
                      }`}
                    >
                      <span className="w-5 h-5 shrink-0 flex items-center justify-center">
                        {done ? "✓" : active ? <Spinner className="w-3 h-3" /> : "○"}
                      </span>
                      <span>{stage.label}</span>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground mt-8">
                This usually takes 1–3 minutes. You'll be taken to the player automatically.
              </p>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
