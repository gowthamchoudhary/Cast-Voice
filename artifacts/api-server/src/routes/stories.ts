import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, storiesTable } from "@workspace/db";
import { GetStoryParams, FetchStoryFromUrlBody, ParseStoryTextBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const MAX_TEXT_LENGTH = 8000;

// -------- AI-powered extraction --------

async function extractWithAI(text: string): Promise<{
  title: string;
  genre: string;
  synopsis: string;
  characters: Array<{ id: string; name: string; description: string }>;
}> {
  const prompt = `You are a story analyst. Given the following story text, extract:
1. A short title (max 60 chars)
2. Genre (one of: Thriller, Fantasy, Horror, Sci-Fi, Romance, Comedy, Drama, Mystery)
3. A synopsis (2-3 sentences)
4. Up to 8 main characters with their names and brief descriptions (1 sentence each)

Respond ONLY with valid JSON in this exact format:
{
  "title": "...",
  "genre": "...",
  "synopsis": "...",
  "characters": [{ "id": "char_1", "name": "...", "description": "..." }]
}

Story text:
${text.slice(0, MAX_TEXT_LENGTH)}`;

  try {
    const resp = await fetch("https://text.pollinations.ai/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
        model: "openai",
        jsonMode: true,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!resp.ok) throw new Error("AI service unavailable");
    const raw = await resp.text();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.characters || !Array.isArray(parsed.characters)) throw new Error("Invalid AI response");

    const characters = parsed.characters.slice(0, 8).map((c: { id?: string; name?: string; description?: string }, i: number) => ({
      id: c.id || `char_${i + 1}`,
      name: (c.name || `Character ${i + 1}`).trim(),
      description: (c.description || "A character in the story").trim(),
    }));

    return {
      title: (parsed.title || "Untitled Story").slice(0, 60),
      genre: parsed.genre || "Drama",
      synopsis: parsed.synopsis || "",
      characters,
    };
  } catch (err) {
    logger.warn({ err }, "AI extraction failed, falling back to regex");
    return fallbackExtract(text);
  }
}

function fallbackExtract(text: string): {
  title: string;
  genre: string;
  synopsis: string;
  characters: Array<{ id: string; name: string; description: string }>;
} {
  const characterMap = new Map<string, number>();

  const dialoguePattern = /\b([A-Z][A-Z\s]{1,20}[A-Z])(?:\s*:|\s+said|\s+replied|\s+asked)/g;
  let match;
  while ((match = dialoguePattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (name.length > 2 && name.length < 30) {
      characterMap.set(name, (characterMap.get(name) || 0) + 1);
    }
  }
  const scriptPattern = /^([A-Z][a-zA-Z\s]{1,25})\s*:/gm;
  while ((match = scriptPattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (name.length > 2 && name.split(" ").length <= 4) {
      characterMap.set(name, (characterMap.get(name) || 0) + 1);
    }
  }

  const sortedChars = Array.from(characterMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const characters = sortedChars.length > 0
    ? sortedChars.map(([name], i) => ({ id: `char_${i + 1}`, name, description: "Character from the story" }))
    : [
        { id: "char_1", name: "Narrator", description: "Story narrator" },
        { id: "char_2", name: "Main Character", description: "The protagonist" },
      ];

  const firstLine = text.split("\n")[0]?.trim() || "Uploaded Story";
  const title = firstLine.length > 60 ? firstLine.slice(0, 60) + "..." : firstLine;
  return { title, genre: "Drama", synopsis: "", characters };
}

async function generateSceneImage(title: string): Promise<string> {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(
    `cinematic scene from: ${title}, dark atmospheric dramatic lighting film noir`
  )}?width=800&height=400&nologo=true`;
}

// -------- Routes --------

router.get("/stories", async (_req: Request, res: Response): Promise<void> => {
  const stories = await db
    .select()
    .from(storiesTable)
    .where(eq(storiesTable.isCustom, false))
    .orderBy(storiesTable.id);

  res.json(stories.map((s) => ({
    ...s,
    scriptJson: s.scriptJson as object,
    characters: s.characters as Array<{ id: string; name: string; description: string }>,
  })));
});

router.get("/stories/fetch-url", async (_req: Request, res: Response): Promise<void> => {
  res.status(405).json({ error: "Use POST" });
});

router.post("/stories/fetch-url", async (req: Request, res: Response): Promise<void> => {
  const parsed = FetchStoryFromUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const response = await fetch(parsed.data.url, {
      headers: { "User-Agent": "Mozilla/5.0 CastVoice/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      res.status(400).json({ error: `Could not fetch URL (HTTP ${response.status})` });
      return;
    }
    const html = await response.text();

    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_TEXT_LENGTH);

    if (text.length < 100) {
      res.status(400).json({ error: "The URL didn't return enough text. Try pasting the story directly." });
      return;
    }

    const extracted = await extractWithAI(text);
    const sceneImageUrl = await generateSceneImage(extracted.title);

    // Save to DB so it has an id for project creation
    const [saved] = await db
      .insert(storiesTable)
      .values({
        title: extracted.title,
        genre: extracted.genre,
        synopsis: extracted.synopsis,
        characters: extracted.characters,
        scriptJson: { scenes: [] },
        sceneImageUrl,
        isCustom: true,
        rawText: text.slice(0, 5000),
      })
      .returning();

    res.json({
      id: saved.id,
      title: saved.title,
      genre: saved.genre,
      synopsis: saved.synopsis,
      characters: saved.characters,
      sceneImageUrl: saved.sceneImageUrl,
    });
  } catch (err) {
    logger.error({ err }, "URL fetch/parse error");
    res.status(400).json({ error: "Could not fetch or parse the URL. Try pasting the story text directly." });
  }
});

router.post("/stories/parse-text", async (req: Request, res: Response): Promise<void> => {
  const parsed = ParseStoryTextBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rawText = parsed.data.text.trim();
  if (rawText.length < 50) {
    res.status(400).json({ error: "Story text is too short. Please provide at least 50 characters." });
    return;
  }

  const truncatedText = rawText.slice(0, MAX_TEXT_LENGTH);
  const wasTruncated = rawText.length > MAX_TEXT_LENGTH;

  const extracted = await extractWithAI(truncatedText);
  const sceneImageUrl = await generateSceneImage(extracted.title);

  // Save to DB so it has an id
  const [saved] = await db
    .insert(storiesTable)
    .values({
      title: extracted.title,
      genre: extracted.genre,
      synopsis: extracted.synopsis,
      characters: extracted.characters,
      scriptJson: { scenes: [], rawText: truncatedText },
      sceneImageUrl,
      isCustom: true,
      rawText: truncatedText,
    })
    .returning();

  res.json({
    id: saved.id,
    title: saved.title,
    genre: saved.genre,
    synopsis: saved.synopsis,
    characters: saved.characters,
    sceneImageUrl: saved.sceneImageUrl,
    truncated: wasTruncated,
    charLimit: MAX_TEXT_LENGTH,
  });
});

router.get("/stories/:id", async (req: Request, res: Response): Promise<void> => {
  const params = GetStoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [story] = await db
    .select()
    .from(storiesTable)
    .where(eq(storiesTable.id, params.data.id));

  if (!story) {
    res.status(404).json({ error: "Story not found" });
    return;
  }

  res.json({
    ...story,
    scriptJson: story.scriptJson as object,
    characters: story.characters as Array<{ id: string; name: string; description: string }>,
  });
});

export default router;
