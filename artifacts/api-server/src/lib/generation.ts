import { eq } from "drizzle-orm";
import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { db, projectsTable, storiesTable } from "@workspace/db";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

interface ScriptLine {
  character: string;
  emotion: string;
  stability?: number;
  text: string;
}

interface ScriptScene {
  scene: number;
  scene_description: string;
  sfx_before?: string;
  lines: ScriptLine[];
}

interface CastEntry {
  voiceType: "user_clone" | "ai_designed" | "library" | "invite";
  elevenLabsVoiceId?: string;
  description?: string;
  inviteUuid?: string;
  personName?: string;
}

const EMOTION_STYLE_MAP: Record<string, number> = {
  panic: 0.9,
  angry: 0.85,
  excited: 0.8,
  fearful: 0.75,
  surprised: 0.7,
  happy: 0.65,
  cheerful: 0.65,
  neutral: 0.5,
  default: 0.5,
  thoughtful: 0.45,
  sad: 0.4,
  melancholy: 0.35,
  calm: 0.2,
  peaceful: 0.15,
  whisper: 0.1,
};

function emotionToStyle(emotion: string): number {
  if (!emotion) return 0.5;
  const key = emotion.toLowerCase().trim();
  return EMOTION_STYLE_MAP[key] ?? 0.5;
}

async function updateProgress(projectId: number, progress: number, step: string) {
  await db
    .update(projectsTable)
    .set({ generationProgress: progress, generationStep: step })
    .where(eq(projectsTable.id, projectId));
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

const ROLE_VOICE_DESCRIPTIONS: Record<string, string> = {
  "Hero": "warm, brave, young adult, determined, clear voice",
  "Villain": "deep, cold, slow, commanding, threatening",
  "Side Character": "natural, conversational, warm, friendly",
  "Mastermind": "calm, precise, low, authoritative, quiet intensity",
  "Hacker": "fast-talking, energetic, young, slightly nervous",
  "Muscle": "very deep, slow, few words, imposing",
  "Insider": "anxious, shaky, whispering, scared",
  "Guard": "official, suspicious, flat, authoritative",
  "Hero (Lost Kingdom)": "young, wondering, earnest, discovering courage",
  "Villain (Lost Kingdom)": "theatrical, cold, echoing, dark",
  "Mentor": "aged, warm, slow, wise, gravelly",
  "Loyal Friend": "upbeat, nervous humor, loyal, young",
  "Creature Companion": "rumbling, gentle, non-human, otherworldly",
  "Skeptic": "dismissive, confident, gradually scared",
  "Scared One": "high pitched, trembling, teenage, panicked",
  "Curious Explorer": "bright, fascinated, quick, then compassionate",
  "Voice in the Dark": "ethereal, hollow, distant, sad, echoing",
  "Captain": "measured, experienced, commanding, steady",
  "AI Assistant": "robotic, flat, neutral, precise, no emotion",
  "Engineer": "practical, gruff, skeptical, working class",
  "Scientist": "excited, breathless, wonder-filled, emotional",
  "Unknown Entity": "distorted, layered, barely human, slow",
  "Planner": "bright, organized, then internally screaming",
  "Late Friend": "breathless, apologetic, casual, warm",
  "Overreactor": "dramatic, loud, full emotion, comedic",
  "Chill One": "relaxed, unbothered, dry humor, slow",
  "Random Stranger": "cheerful, oblivious, friendly",
  "Narrator": "rich, resonant, warm, storytelling, cinematic",
  "Comic Relief": "playful, light, energetic, fun",
  "Antagonist": "cold, calculating, menacing, crisp diction",
};

function descriptionFromRole(roleOrDescription: string): string {
  const direct = ROLE_VOICE_DESCRIPTIONS[roleOrDescription];
  if (direct) return direct;
  const lower = roleOrDescription.toLowerCase();
  for (const [key, val] of Object.entries(ROLE_VOICE_DESCRIPTIONS)) {
    if (lower.includes(key.toLowerCase())) return val;
  }
  return roleOrDescription;
}

async function designVoiceForCharacter(
  char: { id: string; name: string; description: string },
  castEntry: CastEntry | undefined,
): Promise<string> {
  if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not set");

  let voiceDescription: string;

  if (castEntry?.voiceType === "ai_designed" && castEntry.description) {
    // User typed a custom voice description — use it directly
    voiceDescription = castEntry.description;
  } else {
    // user_clone / library / invite / no cast entry:
    // look up by character description/role in the role map, fall back to raw description
    voiceDescription = descriptionFromRole(char.description || char.name);
  }

  const endpoint = "https://api.elevenlabs.io/v1/voice-generation/generate-voice";
  const t0 = Date.now();
  logger.info({ endpoint, characterName: char.name, voiceDescription }, "Designing voice");

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        voice_description: voiceDescription.trim(),
        text: "Hello. I am ready to perform.",
      }),
    },
    30000,
  );

  const responseTimeMs = Date.now() - t0;

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    logger.error({ endpoint, status: response.status, responseTimeMs, errorBody }, "Voice design failed");
    throw new Error(`Voice design failed: HTTP ${response.status} — ${errorBody.slice(0, 200)}`);
  }

  const data = await response.json() as { voice_id?: string };
  logger.info({ endpoint, status: response.status, responseTimeMs, voiceId: data.voice_id, characterName: char.name }, "Voice designed");

  if (!data.voice_id) {
    throw new Error("Voice design returned no voice_id");
  }

  return data.voice_id;
}

async function elevenLabsTTS(
  voiceId: string,
  text: string,
  emotion: string,
  stability: number,
  filePath: string,
): Promise<void> {
  if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not set");

  const style = emotionToStyle(emotion);
  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const t0 = Date.now();
  logger.info({ endpoint, voiceId, emotion, textPreview: text.slice(0, 60) }, "TTS request starting");

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability,
          similarity_boost: 0.85,
          style,
          use_speaker_boost: true,
        },
      }),
    },
    30000,
  );

  const responseTimeMs = Date.now() - t0;

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    logger.error({ endpoint, status: response.status, responseTimeMs, voiceId, errorBody }, "TTS request failed");
    throw new Error(`TTS failed: HTTP ${response.status} — ${errorBody.slice(0, 200)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  await fs.writeFile(filePath, buf);
  logger.info({ endpoint, status: response.status, responseTimeMs, filePath, bytes: buf.length }, "TTS audio saved");
}

async function elevenLabsSFX(description: string, filePath: string): Promise<void> {
  if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not set");

  const endpoint = "https://api.elevenlabs.io/v1/sound-generation";
  const t0 = Date.now();
  logger.info({ endpoint, description }, "SFX request starting");

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text: description,
        duration_seconds: 3,
        prompt_influence: 0.3,
      }),
    },
    20000,
  );

  const responseTimeMs = Date.now() - t0;

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    logger.error({ endpoint, status: response.status, responseTimeMs, errorBody }, "SFX request failed");
    throw new Error(`SFX failed: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  await fs.writeFile(filePath, buf);
  logger.info({ endpoint, status: response.status, responseTimeMs, filePath, bytes: buf.length }, "SFX audio saved");
}

async function mergeWithFfmpeg(projectId: number, orderedFiles: string[]): Promise<Buffer> {
  const concatListPath = `/tmp/concat_${projectId}.txt`;
  const outputPath = `/tmp/final_${projectId}.mp3`;
  const allFiles = [...orderedFiles, concatListPath, outputPath];

  const concatContent = orderedFiles.map(f => `file '${f}'`).join("\n");
  await fs.writeFile(concatListPath, concatContent, "utf8");

  logger.info({ projectId, fileCount: orderedFiles.length, concatListPath, outputPath }, "Running ffmpeg merge");

  try {
    const { stdout, stderr } = await execFileAsync("ffmpeg", [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", concatListPath,
      "-c:a", "libmp3lame",
      "-q:a", "2",
      outputPath,
    ]);
    if (stdout) logger.info({ stdout }, "ffmpeg stdout");
    if (stderr) logger.info({ stderr: stderr.slice(0, 500) }, "ffmpeg stderr");
  } catch (err: any) {
    logger.error({ err: err?.message, stderr: err?.stderr?.slice(0, 500) }, "ffmpeg failed");
    await cleanupTempFiles(projectId, allFiles);
    throw new Error(`ffmpeg merge failed: ${err?.message}`);
  }

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(outputPath);
    logger.info({ projectId, outputBytes: buffer.length }, "ffmpeg merge complete");
  } finally {
    await cleanupTempFiles(projectId, allFiles);
  }

  return buffer;
}

async function cleanupTempFiles(projectId: number, files: string[]) {
  for (const f of files) {
    try {
      await fs.unlink(f);
    } catch {
    }
  }
  logger.info({ projectId, count: files.length }, "Temp files cleaned up");
}

async function getPollinationsImageUrl(prompt: string): Promise<string> {
  const encoded = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encoded}?width=1280&height=720&nologo=true`;
}

function extractDialogueFromRawText(
  rawText: string,
  characters: Array<{ id: string; name: string; description: string }>,
): ScriptScene[] {
  const characterNames = characters.map(c => c.name);
  const lines: ScriptLine[] = [];

  const dialogueRegex = /"([^"]{5,280})"/g;
  const matches = [...rawText.matchAll(dialogueRegex)];

  const SPEECH_VERBS = /\b(said|replied|asked|called|exclaimed|inquired|noted|observed|started|interrupted|responded|answered|continued|whispered|shouted|muttered|quipped|assured|relented|shot back|deflected)\b/i;

  for (const match of matches) {
    const quote = match[1].trim();
    if (!quote || quote.length < 5) continue;

    const matchStart = match.index ?? 0;
    const before = rawText.slice(Math.max(0, matchStart - 80), matchStart);
    const after = rawText.slice(matchStart + quote.length + 2, matchStart + quote.length + 100);

    let assignedChar: string | null = null;

    for (const name of characterNames) {
      if (before.includes(name) || after.includes(name)) {
        assignedChar = name;
        break;
      }
    }

    if (!assignedChar && SPEECH_VERBS.test(after)) {
      assignedChar = characterNames[lines.length % characterNames.length];
    }

    if (!assignedChar) continue;

    let emotion = "neutral";
    if (quote.endsWith("!") || /\b(amazing|incredible|no!|yes!)\b/i.test(quote)) emotion = "excited";
    else if (quote.endsWith("?")) emotion = "curious";
    else if (/\b(sorry|afraid|hate|never|why)\b/i.test(quote)) emotion = "sad";

    lines.push({ character: assignedChar, emotion, stability: 0.5, text: quote });
  }

  if (lines.length === 0) return [];

  const linesPerScene = Math.max(4, Math.ceil(lines.length / 4));
  const scenes: ScriptScene[] = [];
  for (let i = 0; i < lines.length && scenes.length < 4; i += linesPerScene) {
    const sceneLines = lines.slice(i, i + linesPerScene);
    if (sceneLines.length === 0) break;
    scenes.push({
      scene: scenes.length + 1,
      scene_description: `Scene ${scenes.length + 1}: ${sceneLines[0].character} speaks`,
      lines: sceneLines,
    });
  }

  logger.info({ lineCount: lines.length, sceneCount: scenes.length }, "Dialogue extracted from story text");
  return scenes;
}

async function generateScriptFromText(
  rawText: string,
  characters: Array<{ id: string; name: string; description: string }>,
  title: string,
): Promise<ScriptScene[]> {
  const charList = characters.slice(0, 4).map(c => `- ${c.name}: ${c.description.slice(0, 80)}`).join("\n");
  const storyChunk = rawText.slice(0, 3000);

  const prompt = `You are a script writer. Convert this story excerpt into a radio drama with 2-3 scenes of 4-6 dialogue lines each.

Story: "${title}"
Characters:
${charList}

Excerpt:
${storyChunk}

Respond ONLY with valid JSON (no markdown):
{"scenes":[{"scene":1,"scene_description":"brief description","lines":[{"character":"Name","emotion":"neutral","stability":0.5,"text":"dialogue"}]}]}`;

  try {
    const resp = await fetchWithTimeout("https://text.pollinations.ai/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
        model: "openai",
        jsonMode: true,
      }),
    }, 35000);

    if (resp.ok) {
      const raw = await resp.text();
      logger.info({ rawPreview: raw.slice(0, 200) }, "Pollinations script response received");
      try {
        const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
          logger.info({ sceneCount: parsed.scenes.length }, "Script generated via Pollinations AI");
          return parsed.scenes;
        }
        logger.warn({ parsed: JSON.stringify(parsed).slice(0, 200) }, "Pollinations returned empty/invalid scenes, using fallback");
      } catch (parseErr: any) {
        logger.warn({ parseErr: parseErr?.message, raw: raw.slice(0, 300) }, "Pollinations JSON parse failed, using fallback");
      }
    } else {
      logger.warn({ status: resp.status }, "Pollinations script generation call failed, using fallback");
    }
  } catch (err: any) {
    logger.warn({ err: err?.message || err }, "Pollinations call errored, using fallback");
  }

  logger.info("Attempting dialogue extraction from raw story text");
  return extractDialogueFromRawText(rawText, characters);
}

export async function generateAudioDrama(projectId: number): Promise<void> {
  logger.info({ projectId }, "Starting audio drama generation");

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const [story] = await db
    .select()
    .from(storiesTable)
    .where(eq(storiesTable.id, project.storyId));

  if (!story) {
    throw new Error(`Story ${project.storyId} not found`);
  }

  const rawCast = (project.castJson as { voices?: Record<string, CastEntry> }) || {};
  const castJson: Record<string, CastEntry> = rawCast.voices || {};
  const script = story.scriptJson as { scenes: ScriptScene[] };
  let scenes: ScriptScene[] = script?.scenes || [];
  const storyCharacters = (story.characters as Array<{ id: string; name: string; description: string }>) || [];

  if (scenes.length === 0) {
    const rawText = (story.scriptJson as { rawText?: string })?.rawText || (story as any).rawText || "";
    if (rawText.length > 50) {
      await updateProgress(projectId, 8, "Writing dialogue script from your story...");
      scenes = await generateScriptFromText(rawText, storyCharacters, story.title);
      if (scenes.length > 0) {
        await db.update(storiesTable)
          .set({ scriptJson: { ...script, scenes } })
          .where(eq(storiesTable.id, story.id));
      }
    }
    if (scenes.length === 0) {
      logger.error({ projectId }, "Script generation produced no scenes");
      await db.update(projectsTable).set({
        status: "error",
        generationStep: "Could not generate a script from your story text. Please try a different story.",
        generationProgress: 100,
      }).where(eq(projectsTable.id, projectId));
      return;
    }
  }

  const charNameToId = new Map<string, string>();
  for (const char of storyCharacters) {
    charNameToId.set(char.name, char.id);
  }

  const totalLines = scenes.reduce((acc, s) => acc + s.lines.length, 0);

  // STEP 1: Design voices for all characters via ElevenLabs Voice Design API
  // Every character regardless of voiceType gets a fresh AI-designed voice:
  //   - ai_designed → use the user's custom description
  //   - user_clone / library / invite → use role-based description from ROLE_VOICE_DESCRIPTIONS
  //   - no cast entry → use character.description from story
  const voiceMap = new Map<string, string>();

  for (let i = 0; i < storyCharacters.length; i++) {
    const char = storyCharacters[i];
    const castEntry = castJson[char.id];
    const progress = 5 + Math.round((i / storyCharacters.length) * 20);
    await updateProgress(projectId, progress, `Designing ${char.name}'s voice...`);

    try {
      const voiceId = await designVoiceForCharacter(char, castEntry);
      voiceMap.set(char.id, voiceId);
    } catch (err: any) {
      logger.error({ err: err?.message, characterName: char.name }, "Voice design failed for character");
      await db.update(projectsTable).set({
        status: "error",
        generationStep: `Voice design failed for ${char.name}: ${err?.message || "Unknown error"}`,
        generationProgress: 100,
      }).where(eq(projectsTable.id, projectId));
      return;
    }
  }

  // STEP 2: Generate audio files for each line and SFX
  const orderedTempFiles: string[] = [];
  let processedLines = 0;

  for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
    const scene = scenes[sceneIdx];

    if (scene.sfx_before) {
      const sfxPath = `/tmp/sfx_${projectId}_${sceneIdx}.mp3`;
      const sfxProgress = 25 + Math.round((processedLines / totalLines) * 55);
      await updateProgress(projectId, sfxProgress, `Adding sound effects for scene ${sceneIdx + 1}...`);
      try {
        await elevenLabsSFX(scene.sfx_before, sfxPath);
        orderedTempFiles.push(sfxPath);
      } catch (err: any) {
        logger.warn({ err: err?.message, sceneIdx }, "SFX generation failed — skipping");
      }
    }

    for (const line of scene.lines) {
      const charId = charNameToId.get(line.character);
      if (!charId || !line.text) {
        processedLines++;
        continue;
      }

      const voiceId = voiceMap.get(charId);
      if (!voiceId) {
        processedLines++;
        continue;
      }

      processedLines++;
      const lineProgress = 25 + Math.round((processedLines / totalLines) * 55);
      await updateProgress(
        projectId,
        lineProgress,
        `Recording line ${processedLines} of ${totalLines}...`,
      );

      const linePath = `/tmp/line_${projectId}_${processedLines}.mp3`;
      try {
        await elevenLabsTTS(
          voiceId,
          line.text,
          line.emotion || "neutral",
          line.stability ?? 0.5,
          linePath,
        );
        orderedTempFiles.push(linePath);
      } catch (err: any) {
        logger.error({ err: err?.message, charId, line: line.text.slice(0, 60) }, "TTS failed for line");
        await cleanupTempFiles(projectId, orderedTempFiles);
        await db.update(projectsTable).set({
          status: "error",
          generationStep: `TTS failed on line ${processedLines}: ${err?.message || "Unknown error"}`,
          generationProgress: 100,
        }).where(eq(projectsTable.id, projectId));
        return;
      }
    }
  }

  // STEP 3: Scene images
  await updateProgress(projectId, 82, "Generating scene imagery...");
  const sceneImages: Record<string, string> = {};
  if (story.sceneImagePrompt) {
    sceneImages["main"] = await getPollinationsImageUrl(story.sceneImagePrompt);
  }
  if (story.sceneImageUrl) {
    sceneImages["cover"] = story.sceneImageUrl;
  }
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    if (scene.scene_description) {
      sceneImages[`scene_${i + 1}`] = await getPollinationsImageUrl(scene.scene_description);
    }
  }

  // STEP 4: Merge with ffmpeg
  await updateProgress(projectId, 88, "Mixing final audio...");

  let finalAudioUrl: string | null = null;

  if (orderedTempFiles.length > 0) {
    try {
      const mergedBuffer = await mergeWithFfmpeg(projectId, orderedTempFiles);
      const base64Audio = mergedBuffer.toString("base64");
      finalAudioUrl = `data:audio/mpeg;base64,${base64Audio}`;
      logger.info({ projectId, sizeKb: Math.round(mergedBuffer.length / 1024) }, "Audio merged and encoded");
    } catch (err: any) {
      logger.error({ err: err?.message }, "ffmpeg merge failed");
      await db.update(projectsTable).set({
        status: "error",
        generationStep: `Audio merge failed: ${err?.message || "Unknown error"}`,
        generationProgress: 100,
      }).where(eq(projectsTable.id, projectId));
      return;
    }
  } else {
    logger.error({ projectId }, "No audio files generated");
    await db.update(projectsTable).set({
      status: "error",
      generationStep: "No audio could be generated — all TTS calls failed",
      generationProgress: 100,
    }).where(eq(projectsTable.id, projectId));
    return;
  }

  await updateProgress(projectId, 95, "Finalizing your audio drama...");

  await db
    .update(projectsTable)
    .set({
      status: "ready",
      finalAudioUrl,
      sceneImagesJson: sceneImages as unknown as object,
      generationProgress: 100,
      generationStep: "Your drama is ready!",
    })
    .where(eq(projectsTable.id, projectId));

  logger.info({ projectId }, "Audio drama generation complete");
}
