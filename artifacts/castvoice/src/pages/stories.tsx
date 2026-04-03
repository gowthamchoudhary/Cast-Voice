import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";

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
          <button onClick={() => setLocation("/stories")} className="text-foreground font-medium">Stories</button>
          <button onClick={() => setLocation("/settings")} className="hover:text-foreground transition-colors">Settings</button>
        </nav>
      </div>
    </header>
  );
}

type Story = {
  id: number;
  title: string;
  genre: string;
  synopsis: string;
  sceneImageUrl?: string;
  characters?: { id: string; name: string; description: string }[];
};

export default function Stories() {
  const [, setLocation] = useLocation();
  const api = useApi();
  const { toast } = useToast();
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [projectTitle, setProjectTitle] = useState("");
  const [customText, setCustomText] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [tab, setTab] = useState<"library" | "custom">("library");

  const { data: stories, isLoading } = useQuery<Story[]>({
    queryKey: ["/api/stories"],
    queryFn: () => api.get("/api/stories").then((r) => r.json()),
  });

  const createProject = useMutation({
    mutationFn: async ({ storyId, title }: { storyId: number; title: string }) => {
      const r = await api.post("/api/projects", { storyId, title });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (project) => {
      setLocation(`/cast/${project.id}`);
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const parseUrl = useMutation({
    mutationFn: async (url: string) => {
      const r = await api.post("/api/stories/fetch-url", { url });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (story) => {
      setSelectedStory(story);
      setProjectTitle(story.title);
    },
    onError: (e: Error) => {
      toast({ title: "Error parsing URL", description: e.message, variant: "destructive" });
    },
  });

  const parseText = useMutation({
    mutationFn: async (text: string) => {
      const r = await api.post("/api/stories/parse-text", { text });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (story) => {
      setSelectedStory(story);
      setProjectTitle(story.title);
    },
    onError: (e: Error) => {
      toast({ title: "Error parsing text", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Tabs */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => setTab("library")}
            className={`pb-2 border-b-2 font-medium text-sm transition-colors ${
              tab === "library" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Story Library
          </button>
          <button
            onClick={() => setTab("custom")}
            className={`pb-2 border-b-2 font-medium text-sm transition-colors ${
              tab === "custom" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Import Custom Story
          </button>
        </div>

        {tab === "library" ? (
          <>
            <div className="mb-6">
              <h1 className="font-serif text-3xl font-bold text-foreground">Story Library</h1>
              <p className="text-muted-foreground mt-1">Choose a story to start casting voices.</p>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-20"><Spinner /></div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {(stories || []).map((story, i) => (
                  <motion.div
                    key={story.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 transition-all cursor-pointer group"
                    onClick={() => {
                      setSelectedStory(story);
                      setProjectTitle(story.title);
                    }}
                  >
                    {story.sceneImageUrl && (
                      <div className="h-44 overflow-hidden bg-muted">
                        <img
                          src={story.sceneImageUrl}
                          alt={story.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                      </div>
                    )}
                    <div className="p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="text-xs">{story.genre}</Badge>
                        <span className="text-xs text-muted-foreground">{story.characters?.length || 0} characters</span>
                      </div>
                      <h3 className="font-serif text-lg font-semibold text-foreground leading-snug mb-2">{story.title}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3">{story.synopsis}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="max-w-2xl">
            <h1 className="font-serif text-3xl font-bold text-foreground mb-6">Import Custom Story</h1>
            <div className="space-y-8">
              <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                <h2 className="font-serif text-lg font-semibold text-foreground">Import from URL</h2>
                <p className="text-muted-foreground text-sm">Paste a URL to a story, article, or script. We'll fetch and parse it automatically.</p>
                <div className="flex gap-3">
                  <Input
                    placeholder="https://example.com/my-story"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    onClick={() => parseUrl.mutate(customUrl)}
                    disabled={!customUrl || parseUrl.isPending}
                  >
                    {parseUrl.isPending ? <Spinner className="w-4 h-4" /> : "Import"}
                  </Button>
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                <h2 className="font-serif text-lg font-semibold text-foreground">Paste Story Text</h2>
                <p className="text-muted-foreground text-sm">Paste your story text and we'll parse it into scenes and characters using AI.</p>
                <Textarea
                  placeholder="Paste your story or script here..."
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  rows={8}
                />
                <Button
                  onClick={() => parseText.mutate(customText)}
                  disabled={!customText || parseText.isPending}
                >
                  {parseText.isPending ? <Spinner className="w-4 h-4 mr-2" /> : null}
                  Parse Story
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Story Detail / Project Create Dialog */}
      <Dialog open={!!selectedStory} onOpenChange={(open) => !open && setSelectedStory(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">{selectedStory?.title}</DialogTitle>
            <DialogDescription>{selectedStory?.synopsis}</DialogDescription>
          </DialogHeader>
          {selectedStory?.characters && selectedStory.characters.length > 0 && (
            <div className="space-y-2 my-2">
              <p className="text-sm font-medium text-foreground">Characters</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {selectedStory.characters.map((c) => (
                  <div key={c.id} className="flex gap-2 text-sm">
                    <span className="text-primary font-medium min-w-[100px]">{c.name}</span>
                    <span className="text-muted-foreground">{c.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="project-title">Project Name</Label>
            <Input
              id="project-title"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              placeholder="My audio drama"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              className="flex-1 glow-primary"
              disabled={!projectTitle || createProject.isPending}
              onClick={() => {
                if (selectedStory && projectTitle) {
                  createProject.mutate({ storyId: selectedStory.id, title: projectTitle });
                }
              }}
            >
              {createProject.isPending ? <Spinner className="w-4 h-4 mr-2" /> : null}
              Start Casting
            </Button>
            <Button variant="outline" onClick={() => setSelectedStory(null)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
