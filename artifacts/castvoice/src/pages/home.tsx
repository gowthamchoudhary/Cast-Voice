import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, useAnimationFrame } from "framer-motion";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";

const GENRES = ["Fantasy", "Thriller", "Sci-Fi", "Horror", "Romance", "Mystery", "Western", "Crime", "Drama", "Adventure", "Comedy"];

function Marquee() {
  const items = [...GENRES, ...GENRES];
  return (
    <div className="relative overflow-hidden py-3 border-y border-white/[0.06] my-16">
      <div className="flex w-max animate-marquee gap-8">
        {items.map((g, i) => (
          <span key={i} className="flex items-center gap-8 text-xs tracking-[0.25em] uppercase text-white/25 font-medium whitespace-nowrap">
            {g}
            <span className="inline-block w-1 h-1 rounded-full bg-amber-500/40" />
          </span>
        ))}
      </div>
    </div>
  );
}

function DustParticles() {
  const particles = Array.from({ length: 28 }, (_, i) => {
    const seed = (i * 137.508) % 1;
    return {
      id: i,
      x: ((i * 37 + 7) % 100),
      startY: ((i * 53 + 11) % 100),
      size: (seed * 2.5) + 0.5,
      opacity: (seed * 0.18) + 0.03,
      duration: (seed * 20) + 18,
      delay: -(seed * 25),
    };
  });

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute block rounded-full bg-amber-100"
          style={{
            left: `${p.x}%`,
            top: `${p.startY}%`,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
          }}
          animate={{
            y: [0, -60, -20, -80, 0],
            x: [0, 12, -8, 6, 0],
            opacity: [p.opacity, p.opacity * 3, p.opacity * 0.5, p.opacity * 2, p.opacity],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

function AmbientLight() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        className="absolute w-[700px] h-[700px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(180,120,40,0.055) 0%, transparent 70%)",
          top: "5%",
          left: "35%",
          transform: "translate(-50%, -50%)",
          filter: "blur(40px)",
        }}
        animate={{
          x: [0, 80, -40, 60, 0],
          y: [0, -50, 70, -30, 0],
        }}
        transition={{
          duration: 28,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(200,150,50,0.035) 0%, transparent 70%)",
          bottom: "10%",
          right: "15%",
          filter: "blur(60px)",
        }}
        animate={{
          x: [0, -50, 30, -20, 0],
          y: [0, 40, -60, 20, 0],
        }}
        transition={{
          duration: 35,
          repeat: Infinity,
          ease: "easeInOut",
          delay: -10,
        }}
      />
    </div>
  );
}

function ScanLines() {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.012) 2px, rgba(255,255,255,0.012) 4px)",
      }}
    />
  );
}

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, isLoading, setLocation]);

  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-[#080808] flex flex-col overflow-hidden relative text-[#e8dcc8]">
      <AmbientLight />
      <DustParticles />
      <ScanLines />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <span className="text-xl font-serif font-bold tracking-tight text-[#e8dcc8]">
          Cast<span className="text-amber-400">Voice</span>
        </span>
        <button
          onClick={handleLogin}
          className="text-sm font-medium text-[#e8dcc8]/70 hover:text-[#e8dcc8] transition-colors border border-white/10 rounded-full px-5 py-2 hover:border-amber-400/30 hover:bg-amber-400/5"
        >
          Sign In
        </button>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2 }}
          className="max-w-5xl mx-auto"
        >
          {/* Tag */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="inline-flex items-center gap-2.5 mb-10"
          >
            <span className="block w-5 h-px bg-amber-400/60" />
            <span className="text-amber-400/80 text-[11px] tracking-[0.3em] uppercase font-medium">
              AI Audio Drama Studio
            </span>
            <span className="block w-5 h-px bg-amber-400/60" />
          </motion.div>

          {/* Heading */}
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.2 }}
            className="font-serif font-bold leading-[1.05] mb-8 text-[#f0e6d0]"
            style={{ fontSize: "clamp(3rem, 8vw, 6.5rem)" }}
          >
            Your stories,{" "}
            <span className="italic text-amber-300/90">cast</span>
            <br />
            <span className="italic text-amber-300/90">with</span> real voices.
          </motion.h1>

          {/* Sub */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.35 }}
            className="text-[#e8dcc8]/50 text-lg max-w-xl mx-auto mb-12 leading-relaxed"
          >
            Upload a story. Cast characters with AI voices or your own. Generate a fully produced audio drama with cinematic sound effects.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <button
              onClick={handleLogin}
              className="group relative inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-[#0a0804] font-semibold text-sm px-8 py-3.5 rounded-full transition-all duration-200 shadow-[0_0_30px_-6px_rgba(251,191,36,0.5)] hover:shadow-[0_0_40px_-4px_rgba(251,191,36,0.7)]"
            >
              Start Creating
              <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex items-center gap-2 text-[#e8dcc8]/50 hover:text-[#e8dcc8] text-sm font-medium px-8 py-3.5 rounded-full border border-white/8 hover:border-white/20 transition-all"
            >
              How it works
            </button>
          </motion.div>
        </motion.div>

        {/* Genre Marquee */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.8 }}
          className="w-full max-w-4xl mt-4"
        >
          <Marquee />
        </motion.div>

        {/* Steps */}
        <motion.div
          id="how"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.6 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-white/[0.05] border border-white/[0.05] rounded-2xl overflow-hidden max-w-4xl w-full mb-16"
        >
          {[
            {
              num: "I",
              title: "Choose a story",
              desc: "Browse our curated library across genres — thriller, fantasy, sci-fi, horror — or upload your own script.",
              icon: (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ),
            },
            {
              num: "II",
              title: "Cast the voices",
              desc: "Assign each character a distinct AI voice, your cloned voice, or invite friends to contribute their own.",
              icon: (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <path d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ),
            },
            {
              num: "III",
              title: "Generate & play",
              desc: "CastVoice renders a fully dramatized production with TTS performances, sound effects, and scene imagery.",
              icon: (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ),
            },
          ].map((s) => (
            <div key={s.num} className="bg-[#0e0e0e] p-8 text-left group hover:bg-[#131313] transition-colors">
              <div className="flex items-center gap-3 mb-5">
                <span className="text-amber-400/70">{s.icon}</span>
                <span className="text-[10px] font-mono tracking-[0.2em] text-white/20 uppercase">{s.num}</span>
              </div>
              <h3 className="font-serif text-base font-semibold text-[#f0e6d0] mb-2">{s.title}</h3>
              <p className="text-[#e8dcc8]/35 text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-5 text-[#e8dcc8]/20 text-xs tracking-widest uppercase">
        Powered by ElevenLabs
      </footer>
    </div>
  );
}
