import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, storiesTable } from "@workspace/db";
import { GetStoryParams, FetchStoryFromUrlBody, ParseStoryTextBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/stories", async (_req: Request, res: Response): Promise<void> => {
  const stories = await db.select().from(storiesTable).orderBy(storiesTable.id);
  res.json(stories.map(s => ({
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
    });
    const html = await response.text();
    
    // Strip HTML tags to get text
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 10000);

    const extracted = parseCharactersFromText(text);
    res.json(extracted);
  } catch (err) {
    logger.error({ err }, "URL fetch error");
    res.status(400).json({ error: "Could not fetch URL" });
  }
});

router.post("/stories/parse-text", async (req: Request, res: Response): Promise<void> => {
  const parsed = ParseStoryTextBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const extracted = parseCharactersFromText(parsed.data.text);
  res.json(extracted);
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

function parseCharactersFromText(text: string): {
  title: string;
  characters: Array<{ id: string; name: string; description: string }>;
  rawText: string;
} {
  // Find potential character names: words in ALL CAPS or "Name:" patterns
  const characterMap = new Map<string, number>();
  
  // Pattern: "CHARACTER_NAME:" or "CHARACTER_NAME said"
  const dialoguePattern = /\b([A-Z][A-Z\s]{1,20}[A-Z])(?:\s*:|\s+said|\s+replied|\s+asked)/g;
  let match;
  while ((match = dialoguePattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (name.length > 2 && name.length < 30) {
      characterMap.set(name, (characterMap.get(name) || 0) + 1);
    }
  }

  // Also look for "Name: dialogue" pattern
  const scriptPattern = /^([A-Z][a-zA-Z\s]{1,25})\s*:/gm;
  while ((match = scriptPattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (name.length > 2 && name.split(" ").length <= 4) {
      characterMap.set(name, (characterMap.get(name) || 0) + 1);
    }
  }

  // Get top characters by frequency
  const sortedChars = Array.from(characterMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const characters = sortedChars.map(([ name ], index) => ({
    id: `char_${index + 1}`,
    name,
    description: "Character from uploaded story",
  }));

  // Extract a title from first line or first 100 chars
  const firstLine = text.split("\n")[0]?.trim() || "Uploaded Story";
  const title = firstLine.length > 60 ? firstLine.slice(0, 60) + "..." : firstLine;

  return {
    title,
    characters: characters.length > 0 ? characters : [
      { id: "char_1", name: "Narrator", description: "Story narrator" },
      { id: "char_2", name: "Main Character", description: "The protagonist" },
    ],
    rawText: text.slice(0, 5000),
  };
}

export default router;
