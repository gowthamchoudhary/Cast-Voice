import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAuth } from "@workspace/replit-auth-web";
import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDistanceToNow } from "date-fns";

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

const STATUS_LABELS: Record<string, { label: string; color: "default" | "secondary" | "destructive" | "outline" }> = {
  casting: { label: "Casting", color: "secondary" },
  generating: { label: "Generating", color: "default" },
  ready: { label: "Ready", color: "default" },
  failed: { label: "Failed", color: "destructive" },
};

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const api = useApi();

  const { data: projects, isLoading } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: () => api.get("/api/projects").then((r) => r.json()),
  });

  return (
    <div className="min-h-screen bg-background">
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
        ) : !projects || projects.length === 0 ? (
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
              const statusInfo = STATUS_LABELS[project.status] || { label: project.status, color: "secondary" as const };
              return (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-colors cursor-pointer group"
                  onClick={() => {
                    if (project.status === "ready") {
                      setLocation(`/play/${project.id}`);
                    } else if (project.status === "generating") {
                      setLocation(`/generate/${project.id}`);
                    } else {
                      setLocation(`/cast/${project.id}`);
                    }
                  }}
                >
                  {project.story?.sceneImageUrl && (
                    <div className="h-40 overflow-hidden bg-muted">
                      <img
                        src={project.story.sceneImageUrl}
                        alt={project.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                  )}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-serif text-base font-semibold text-foreground leading-snug">{project.title}</h3>
                      <Badge variant={statusInfo.color} className="shrink-0 text-xs">{statusInfo.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {project.createdAt
                        ? formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })
                        : ""}
                    </p>
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
