import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, isLoading, setLocation]);

  const handleLogin = () => {
    window.location.href = "/api/auth/login";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-hidden relative">
      {/* Background gradient */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-primary/3 blur-[80px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-serif font-bold text-foreground">
            Cast<span className="text-primary">Voice</span>
          </span>
        </div>
        <Button onClick={handleLogin} className="glow-primary">
          Sign In
        </Button>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 text-center pb-24">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 mb-8">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-primary text-sm font-medium tracking-wide">AI-Powered Audio Drama</span>
          </div>

          <h1 className="text-5xl sm:text-7xl font-serif font-bold text-foreground leading-tight mb-6">
            Your stories,{" "}
            <span className="text-primary italic">cast with</span>{" "}
            real voices.
          </h1>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Upload a story. Cast each character with AI-designed voices, your cloned voice, or invite friends to lend their own. Then generate a fully produced audio drama — complete with sound effects and scene imagery.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={handleLogin}
              size="lg"
              className="glow-primary text-base px-8 py-6"
            >
              Start Creating
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="text-base px-8 py-6"
              onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
            >
              See How It Works
            </Button>
          </div>
        </motion.div>

        {/* Feature cards */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          className="mt-24 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl w-full"
          id="how-it-works"
        >
          {[
            {
              step: "01",
              title: "Choose Your Story",
              desc: "Browse our curated story library across genres — thriller, fantasy, sci-fi, horror, comedy — or import your own script.",
            },
            {
              step: "02",
              title: "Cast the Characters",
              desc: "Assign voices to each character: AI-designed voices, your own cloned voice, or invite friends to record theirs.",
            },
            {
              step: "03",
              title: "Generate & Play",
              desc: "CastVoice produces a fully dramatized audio experience with TTS voices, sound effects, and cinematic scene imagery.",
            },
          ].map((card) => (
            <div
              key={card.step}
              className="bg-card border border-border rounded-xl p-6 text-left hover:border-primary/30 transition-colors"
            >
              <div className="text-primary font-mono text-sm font-bold mb-3">{card.step}</div>
              <h3 className="font-serif text-lg font-semibold text-foreground mb-2">{card.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-6 text-muted-foreground text-sm">
        <span>
          Powered by <span className="text-primary">ElevenLabs</span> · Built with CastVoice
        </span>
      </footer>
    </div>
  );
}
