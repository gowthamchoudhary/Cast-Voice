import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@workspace/replit-auth-web";
import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDistanceToNow } from "date-fns";
import { useState, useRef, useEffect } from "react";

function Nav() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  return (
    <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <button onClick={() => setLocation("/dashboard")} className="font-serif text-xl font-bold text-foreground">
          Cast<span className="text-primary">Voice</span>
        </button>
        <nav className="hidden sm:flex items-center gap-6 text-sm text-muted-foreground">
          <button onClick={() => setLocation("/dashboard")} className="text-foreground font-medium">Dashboard</button>
          <button onClick={() => setLocation("/stories")} className="hover:text-foreground transition-colors">Stories</button>
          <button onClick={() => setLocation("/settings")} className="hover:text-foreground transition-colors">Settings</button>
        </nav>
        <div className="flex items-center gap-3">
          {user?.profileImage ? (
            <img src={user.profileImage} alt={user.name || ""} className="w-8 h-8 rounded-full border border-border" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold">
              {(user?.name || "U")[0].toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

const STATUS_CONFIG: Record<string, { label: string; color: "default" | "secondary" | "destructive" | "outline"; icon: string }> = {
  draft:      { label: "Casting",    color: "secondary",    icon: "🎭" },
  casting:    { label: "Casting",    color: "secondary",    icon: "🎭" },
  generating: { label: "Generating", color: "default",      icon: "⚡" },
  ready:      { label: "Ready",      color: "default",      icon: "▶" },
  error:      { label: "Failed",     color: "destructive",  icon: "✕" },
};

function ProjectMenu({ projectId, onDelete }: { projectId: number; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Project options"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.2" />
          <circle cx="8" cy="8" r="1.2" />
          <circle cx="8" cy="13" r="1.2" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute right-0 top-9 z-50 w-36 bg-popover border border-border rounded-lg shadow-lg py-1 text-sm"
          >
            <button
              onClick={() => { setOpen(false); onDelete(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-destructive hover:bg-destructive/10 transition-colors rounded-sm"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
              Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DeleteConfirmDialog({ title, onConfirm, onCancel }: { title: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-5">
          <div className="text-4xl mb-3">🗑️</div>
          <h3 className="font-serif text-lg font-semibold text-foreground mb-1">Delete project?</h3>
          <p className="text-sm text-muted-foreground">
            "<span className="text-foreground font-medium">{title}</span>" will be permanently deleted. This cannot be undone.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" className="flex-1" onClick={onConfirm}>Delete</Button>
        </div>
      </motion.div>
    </div>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; title: string } | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());

  const { data: rawProjects, isLoading } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: () => api.get("/api/projects").then((r) => r.json()),
  });
  const projects = Array.isArray(rawProjects) ? rawProjects : [];

  async function handleDelete(id: number) {
    setConfirmDelete(null);
    setDeletingIds(prev => new Set(prev).add(id));
    try {
      await api.del(`/api/projects/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    } finally {
      setDeletingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AnimatePresence>
        {confirmDelete && (
          <DeleteConfirmDialog
            title={confirmDelete.title}
            onConfirm={() => handleDelete(confirmDelete.id)}
            onCancel={() => setConfirmDelete(null)}
          />
        )}
      </AnimatePresence>
      <Nav />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="font-serif text-3xl font-bold text-foreground">Your Projects</h1>
            <p className="text-muted-foreground mt-1">Cast stories, generate audio dramas, share them with the world.</p>
          </div>
          <Button onClick={() => setLocation("/stories")} className="glow-primary">
            + New Project
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : projects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="text-6xl mb-4">🎭</div>
            <h2 className="font-serif text-2xl font-semibold text-foreground mb-2">No projects yet</h2>
            <p className="text-muted-foreground mb-6 max-w-sm">
              Pick a story from our library, cast the characters with voices, and create your first audio drama.
            </p>
            <Button onClick={() => setLocation("/stories")} className="glow-primary">
              Browse Stories
            </Button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {(projects as any[]).map((project: any, i: number) => {
              const status = project.status || "draft";
              const statusInfo = STATUS_CONFIG[status] || { label: status, color: "secondary" as const, icon: "🎭" };
              const title = project.storyTitle || project.title || "Untitled";
              const synopsis = project.synopsis || "";
              const imageUrl = project.sceneImageUrl || project.story?.sceneImageUrl;

              const isDeleting = deletingIds.has(project.id);

              return (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: isDeleting ? 0.4 : 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 transition-all cursor-pointer group shadow-sm hover:shadow-md relative"
                  onClick={() => {
                    if (isDeleting) return;
                    if (status === "ready") {
                      setLocation(`/play/${project.id}`);
                    } else if (status === "generating") {
                      setLocation(`/generate/${project.id}`);
                    } else {
                      setLocation(`/cast/${project.id}`);
                    }
                  }}
                >
                  {/* Cover image */}
                  <div className="h-44 overflow-hidden bg-gradient-to-br from-primary/10 via-muted to-muted relative">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-5xl opacity-30">
                        🎭
                      </div>
                    )}
                    {/* Genre chip */}
                    {project.storyGenre && (
                      <div className="absolute top-3 left-3 bg-black/60 text-white text-[10px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm">
                        {project.storyGenre}
                      </div>
                    )}
                    {/* Status chip */}
                    <div className="absolute top-3 right-3">
                      <Badge variant={statusInfo.color} className="text-xs shadow-sm">
                        {statusInfo.icon} {statusInfo.label}
                      </Badge>
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="p-5">
                    <h3 className="font-serif text-base font-semibold text-foreground leading-snug mb-1 line-clamp-2">
                      {title}
                    </h3>
                    {synopsis && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
                        {synopsis}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground">
                        {project.createdAt
                          ? formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })
                          : ""}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-primary font-medium group-hover:underline">
                          {status === "ready" ? "Play →" : status === "generating" ? "View progress →" : "Continue →"}
                        </span>
                        {!isDeleting && (
                          <ProjectMenu
                            projectId={project.id}
                            onDelete={() => setConfirmDelete({ id: project.id, title })}
                          />
                        )}
                        {isDeleting && <Spinner className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
