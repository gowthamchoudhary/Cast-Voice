import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useApi } from "@/hooks/use-api";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";

function Nav() {
  const [, setLocation] = useLocation();
  return (
    <header className="border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <button onClick={() => setLocation("/dashboard")} className="font-serif text-xl font-bold text-[#f0e6d0]">
          Cast<span className="text-amber-400">Voice</span>
        </button>
        <button onClick={() => setLocation("/dashboard")} className="text-sm text-[#e8dcc8]/40 hover:text-[#e8dcc8] transition-colors">
          ← Dashboard
        </button>
      </div>
    </header>
  );
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function Play({ projectId }: { projectId: string }) {
  const [, setLocation] = useLocation();
  const api = useApi();
  const queryClient = useQueryClient();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentScene, setCurrentScene] = useState(0);
  const [volume, setVolume] = useState(1);
  const [audioError, setAudioError] = useState(false);
  const playingRef = useRef(false); // guard against race conditions

  const { data: project, isLoading } = useQuery({
    queryKey: [`/api/projects/${projectId}`],
    queryFn: () => api.get(`/api/projects/${projectId}`).then((r) => r.json()),
  });

  // Must be declared before any early returns to follow Rules of Hooks
  const regenerate = useMutation({
    mutationFn: () => api.post(`/api/projects/${projectId}/generate`, {}).then(r => r.json()),
    onSuccess: () => {
      setLocation(`/generate/${projectId}`);
    },
  });

  const p = project as any;
  // Audio is served via a dedicated endpoint instead of an embedded data URL
  const audioUrl = p?.hasAudio ? `/api/projects/${projectId}/audio` : null;
  const scenes = p?.story?.scriptJson?.scenes || [];
  const currentSceneData = scenes[currentScene];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onDuration = () => {
      if (isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onEnd = () => { setIsPlaying(false); playingRef.current = false; };
    const onError = () => { setAudioError(true); setIsPlaying(false); playingRef.current = false; };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("error", onError);
    };
  }, [audioUrl]); // re-attach when source changes

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingRef.current || isPlaying) {
      audio.pause();
      playingRef.current = false;
      setIsPlaying(false);
    } else {
      try {
        playingRef.current = true;
        setIsPlaying(true);
        await audio.play();
      } catch (err: any) {
        // AbortError is harmless (e.g. rapid click); other errors are real
        if (err?.name !== "AbortError") {
          setAudioError(true);
        }
        playingRef.current = false;
        setIsPlaying(false);
      }
    }
  };

  const handleSeek = ([val]: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const handleVolume = ([val]: number[]) => {
    setVolume(val);
    if (audioRef.current) audioRef.current.volume = val;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!audioUrl || audioError) {
    return (
      <div className="min-h-screen bg-background">
        <Nav />
        <div className="flex flex-col items-center justify-center py-24 text-center px-4">
          <div className="text-5xl mb-4">🎭</div>
          <h2 className="font-serif text-2xl text-foreground mb-2">
            {audioError ? "Audio Playback Failed" : "Audio Not Ready"}
          </h2>
          <p className="text-muted-foreground mb-8 max-w-sm">
            {audioError
              ? "The audio file couldn't be played — it may have been generated with errors. Regenerate to fix it."
              : "The drama hasn't been generated yet, or generation ran into an issue. Try generating again."}
          </p>
          <div className="flex gap-3">
            <Button
              onClick={() => regenerate.mutate()}
              disabled={regenerate.isPending}
              className="glow-primary"
            >
              {regenerate.isPending ? <Spinner className="w-4 h-4 mr-2" /> : null}
              Generate Again
            </Button>
            <Button variant="outline" onClick={() => setLocation(`/cast/${projectId}`)}>
              Edit Casting
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Nav />

      {/* Scene image */}
      <div className="relative flex-1 flex flex-col">
        {currentSceneData?.scene_description && (
          <motion.div
            key={currentScene}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative h-64 sm:h-80 overflow-hidden bg-muted"
          >
            {p?.story?.sceneImageUrl && (
              <img
                src={p.story.sceneImageUrl}
                alt="Scene"
                className="w-full h-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6">
              <Badge variant="secondary" className="mb-2">Scene {currentScene + 1}</Badge>
              <p className="text-white text-sm italic">{currentSceneData.scene_description}</p>
            </div>
          </motion.div>
        )}

        {/* Script lines */}
        <div className="max-w-3xl mx-auto w-full px-6 py-8 flex-1">
          <h1 className="font-serif text-2xl font-bold text-foreground mb-2">{p?.title}</h1>
          <p className="text-muted-foreground text-sm mb-6">{p?.story?.title}</p>

          {/* Scene nav */}
          {scenes.length > 1 && (
            <div className="flex gap-2 mb-6 flex-wrap">
              {scenes.map((_: any, i: number) => (
                <button
                  key={i}
                  onClick={() => setCurrentScene(i)}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    i === currentScene
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  Scene {i + 1}
                </button>
              ))}
            </div>
          )}

          {/* Lines */}
          <div className="space-y-4">
            {(currentSceneData?.lines || []).map((line: any, i: number) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex gap-4"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-sm font-bold shrink-0 mt-0.5">
                  {line.character[0]}
                </div>
                <div>
                  <p className="text-primary text-sm font-medium mb-0.5">{line.character}</p>
                  <p className="text-foreground leading-relaxed">{line.text}</p>
                  <p className="text-muted-foreground text-xs italic mt-1">{line.emotion}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Audio player */}
      <div className="sticky bottom-0 bg-card/95 backdrop-blur-sm border-t border-border px-6 py-4">
        <audio ref={audioRef} src={audioUrl} preload="metadata" />
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-4 mb-3">
            <span className="text-xs text-muted-foreground w-10 text-right">{formatTime(currentTime)}</span>
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={0.1}
              onValueChange={handleSeek}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground w-10">{formatTime(duration)}</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlay}
              className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl hover:bg-primary/90 transition-colors glow-primary"
            >
              {isPlaying ? "⏸" : "▶"}
            </button>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-muted-foreground">🔊</span>
              <Slider
                value={[volume]}
                max={1}
                step={0.01}
                onValueChange={handleVolume}
                className="w-24"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
