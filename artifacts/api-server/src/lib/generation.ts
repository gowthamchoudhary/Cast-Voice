import { eq } from "drizzle-orm";
import { db, projectsTable, storiesTable, inviteLinksTable, userProfilesTable } from "@workspace/db";
import { logger } from "./logger";

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

// ---------------------------------------------------------------------------
// Free TTS fallback — Google Translate TTS (no key required, mp3 response)
// Different locales give slightly different voice tones for character variety
// ---------------------------------------------------------------------------
const FALLBACK_LOCALES_NEUTRAL = ["en-US", "en-GB", "en-AU", "en-IN"];
const FALLBACK_LOCALES_FEMALE = ["en-GB", "en-AU", "en-IN", "en-US"];

function pickFallbackLocale(description: string, characterIndex: number): string {
  const desc = (description || "").toLowerCase();
  const isFeminine =
    desc.includes("female") ||
    desc.includes("woman") ||
    desc.includes("girl") ||
    desc.includes("lady") ||
    desc.includes("feminine") ||
    desc.includes("warm") ||
    desc.includes("gentle");

  const pool = isFeminine ? FALLBACK_LOCALES_FEMALE : FALLBACK_LOCALES_NEUTRAL;
  return pool[characterIndex % pool.length];
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function fallbackTTS(text: string, locale: string): Promise<Buffer | null> {
  // Split long text into <=200-char chunks (Google TTS limit)
  const chunks: string[] = [];
  const words = text.split(" ");
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > 195) {
      if (current) chunks.push(current.trim());
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) chunks.push(current);

  const buffers: Buffer[] = [];
  for (const chunk of chunks) {
    try {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${encodeURIComponent(locale)}&client=tw-ob`;
      const response = await fetchWithTimeout(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; CastVoice/1.0)" },
      }, 10000);
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        logger.warn({ status: response.status, locale, body: body.slice(0, 200) }, "Google TTS request failed");
        continue;
      }
      const arrayBuffer = await response.arrayBuffer();
      const buf = Buffer.from(arrayBuffer);
      logger.info({ locale, bytes: buf.length }, "Google TTS chunk received");
      if (buf.length > 100) buffers.push(buf);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        logger.warn({ locale, chunk }, "Google TTS timed out");
      } else {
        logger.error({ err: { message: err?.message, code: err?.code, name: err?.name } }, "Google TTS error");
      }
    }
  }
  return buffers.length > 0 ? Buffer.concat(buffers) : null;
}

// ---------------------------------------------------------------------------
// ElevenLabs TTS — returns null on any failure (including 402 quota)
// ---------------------------------------------------------------------------
let elevenLabsQuotaExceeded = false; // session-level flag to skip after first 402

async function elevenLabsTTS(
  voiceId: string,
  text: string,
  emotion: string,
  stability: number,
): Promise<Buffer | null> {
  if (!ELEVENLABS_API_KEY || elevenLabsQuotaExceeded) return null;

  const style = emotionToStyle(emotion);

  try {
    const response = await fetchWithTimeout(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2",
          voice_settings: {
            stability,
            similarity_boost: 0.8,
            style,
            use_speaker_boost: true,
          },
        }),
      },
      15000,
    );

    if (!response.ok) {
      if (response.status === 402) {
        elevenLabsQuotaExceeded = true;
        logger.warn("ElevenLabs quota exceeded — switching to fallback TTS for all remaining lines");
      } else {
        logger.warn({ status: response.status, voiceId, emotion }, "TTS request failed");
      }
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    logger.error({ err }, "TTS error");
    return null;
  }
}

async function elevenLabsSFX(description: string): Promise<Buffer | null> {
  if (!ELEVENLABS_API_KEY || elevenLabsQuotaExceeded) return null;

  try {
    const response = await fetchWithTimeout(
      "https://api.elevenlabs.io/v1/sound-generation",
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
      15000,
    );

    if (!response.ok) {
      if (response.status === 402) elevenLabsQuotaExceeded = true;
      logger.warn({ status: response.status }, "SFX request failed");
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    logger.error({ err }, "SFX error");
    return null;
  }
}

async function getPollinationsImageUrl(prompt: string): Promise<string> {
  const encoded = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encoded}?width=1280&height=720&nologo=true`;
}

async function designVoice(description: string, characterName?: string): Promise<string> {
  if (!ELEVENLABS_API_KEY || elevenLabsQuotaExceeded) return getDefaultVoice(description);

  const previewText = `Hello. I am ${characterName || "a character"}, ready to bring this story to life.`;

  try {
    const response = await fetch("https://api.elevenlabs.io/v1/voice-generation/generate-voice", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        voice_description: description.trim(),
        text: previewText,
      }),
    });

    if (!response.ok) {
      return getDefaultVoice(description);
    }

    const data = await response.json() as { voice_id?: string };
    return data.voice_id || getDefaultVoice(description);
  } catch {
    return getDefaultVoice(description);
  }
}

function getDefaultVoice(description: string): string {
  const desc = (description || "").toLowerCase();
  if (desc.includes("deep") || desc.includes("gruff") || desc.includes("baritone")) return "pNInz6obpgDQGcFmaJgB";
  if (desc.includes("warm") || desc.includes("gentle") || desc.includes("feminine")) return "EXAVITQu4vr4xnSDxMaL";
  if (desc.includes("young") || desc.includes("teen") || desc.includes("energetic")) return "jBpfuIE2acCo8z3wKNLl";
  if (desc.includes("command") || desc.includes("leader") || desc.includes("villain")) return "VR6AewLTigWG4xSOukaG";
  if (desc.includes("nervous") || desc.includes("scared") || desc.includes("timid")) return "oWAxZDx7w5VEj9dCyTzz";
  if (desc.includes("playful") || desc.includes("fun") || desc.includes("cheerful")) return "jsCqWAovK2LkecY7zXl4";
  if (desc.includes("ethereal") || desc.includes("mystic") || desc.includes("mysterious")) return "XB0fDUnXU5powFXDhCwa";
  return "pNInz6obpgDQGcFmaJgB";
}

// ---------------------------------------------------------------------------
// Script generation — converts raw story text + characters into dialogue scenes
// ---------------------------------------------------------------------------
async function generateScriptFromText(
  rawText: string,
  characters: Array<{ id: string; name: string; description: string }>,
  title: string,
): Promise<ScriptScene[]> {
  const charList = characters.map(c => `- ${c.name}: ${c.description}`).join("\n");
  const prompt = `You are a dramatic script writer. Convert the following story into a radio drama script with 2-4 scenes.

Story title: "${title}"

Characters:
${charList}

Story text:
${rawText.slice(0, 6000)}

Write a script where the characters have natural dialogue that dramatizes the key moments of the story.
Each scene should have 4-8 lines of dialogue.

Respond ONLY with valid JSON in this exact format (no markdown, no extra text):
{
  "scenes": [
    {
      "scene": 1,
      "scene_description": "Brief scene description for imagery",
      "sfx_before": "optional sound effect description or omit",
      "lines": [
        {
          "character": "EXACT character name from the list above",
          "emotion": "one word emotion",
          "stability": 0.5,
          "text": "What the character says"
        }
      ]
    }
  ]
}`;

  try {
    const resp = await fetchWithTimeout("https://text.pollinations.ai/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
        model: "openai",
        jsonMode: true,
      }),
    }, 40000);

    if (!resp.ok) {
      logger.warn({ status: resp.status }, "Script generation AI call failed");
      return [];
    }

    const raw = await resp.text();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.scenes)) return [];
    logger.info({ sceneCount: parsed.scenes.length }, "Script generated from story text");
    return parsed.scenes;
  } catch (err) {
    logger.error({ err }, "Script generation failed");
    return [];
  }
}

export async function generateAudioDrama(projectId: number): Promise<void> {
  logger.info({ projectId }, "Starting audio drama generation");

  // Reset quota flag for each generation run
  elevenLabsQuotaExceeded = false;

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

  // Look up owner's voice clone ID for user_clone assignments
  const [ownerProfile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.id, project.userId));

  const ownerVoiceCloneId = ownerProfile?.voiceCloneId;

  // castJson is stored as { voices: { [characterId]: CastEntry } }
  const rawCast = (project.castJson as { voices?: Record<string, CastEntry> }) || {};
  const castJson: Record<string, CastEntry> = rawCast.voices || {};
  const script = story.scriptJson as { scenes: ScriptScene[] };
  let scenes: ScriptScene[] = script?.scenes || [];
  const storyCharacters = (story.characters as Array<{ id: string; name: string; description: string }>) || [];

  // If scenes is empty (user uploaded raw story text), generate dialogue script now
  if (scenes.length === 0) {
    const rawText = (story.scriptJson as { rawText?: string })?.rawText || (story as any).rawText || "";
    if (rawText.length > 50) {
      await updateProgress(projectId, 8, "Writing dialogue script from your story...");
      scenes = await generateScriptFromText(rawText, storyCharacters, story.title);
      if (scenes.length > 0) {
        // Save generated scenes back into the story so next generation is instant
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

  // STEP 1: Resolve ElevenLabs voices for all characters
  await updateProgress(projectId, 5, "Designing character voices...");

  const voiceMap = new Map<string, string>(); // characterId -> elevenLabsVoiceId (may be undefined if quota exceeded)

  for (const char of storyCharacters) {
    const castEntry = castJson[char.id];
    if (!castEntry) {
      const voiceId = await designVoice(char.description, char.name);
      voiceMap.set(char.id, voiceId);
      continue;
    }

    if (castEntry.voiceType === "user_clone") {
      if (ownerVoiceCloneId) {
        voiceMap.set(char.id, ownerVoiceCloneId);
      } else {
        voiceMap.set(char.id, getDefaultVoice(char.description));
      }
    } else if (castEntry.voiceType === "ai_designed") {
      if (castEntry.elevenLabsVoiceId) {
        voiceMap.set(char.id, castEntry.elevenLabsVoiceId);
      } else {
        const voiceId = await designVoice(
          castEntry.description || char.description,
          char.name,
        );
        voiceMap.set(char.id, voiceId);
      }
    } else if (castEntry.voiceType === "library" && castEntry.elevenLabsVoiceId) {
      voiceMap.set(char.id, castEntry.elevenLabsVoiceId);
    } else if (castEntry.voiceType === "invite") {
      if (castEntry.inviteUuid) {
        const [invite] = await db
          .select()
          .from(inviteLinksTable)
          .where(eq(inviteLinksTable.uuid, castEntry.inviteUuid));
        if (invite?.voiceCloneId) {
          voiceMap.set(char.id, invite.voiceCloneId);
        } else {
          const voiceId = await designVoice(char.description, char.name);
          voiceMap.set(char.id, voiceId);
        }
      } else if (castEntry.elevenLabsVoiceId) {
        voiceMap.set(char.id, castEntry.elevenLabsVoiceId);
      } else {
        voiceMap.set(char.id, getDefaultVoice(char.description));
      }
    } else {
      voiceMap.set(char.id, getDefaultVoice(char.description));
    }
  }

  // Build a fallback locale map (Google TTS) indexed by character position
  const fallbackLocaleMap = new Map<string, string>();
  storyCharacters.forEach((char, index) => {
    const castEntry = castJson[char.id];
    const desc = castEntry?.description || char.description || "";
    fallbackLocaleMap.set(char.id, pickFallbackLocale(desc, index));
  });

  await updateProgress(projectId, 20, "Writing emotional delivery for each line...");
  await new Promise(r => setTimeout(r, 500));

  // STEP 2: Generate dialogue audio
  await updateProgress(projectId, 30, "Generating dialogue...");

  const audioSegments: Buffer[] = [];
  const totalLines = scenes.reduce((acc, s) => acc + s.lines.length, 0);
  let processedLines = 0;

  for (const scene of scenes) {
    if (scene.sfx_before) {
      const sfxBuffer = await elevenLabsSFX(scene.sfx_before);
      if (sfxBuffer) audioSegments.push(sfxBuffer);
    }

    for (const line of scene.lines) {
      const charId = charNameToId.get(line.character);

      if (charId && line.text) {
        const stability = line.stability ?? 0.5;
        const elevenLabsVoiceId = charId ? voiceMap.get(charId) : undefined;

        // Try ElevenLabs first, fall back to StreamElements if quota exceeded or failed
        let audioBuffer: Buffer | null = null;

        if (elevenLabsVoiceId && !elevenLabsQuotaExceeded) {
          audioBuffer = await elevenLabsTTS(elevenLabsVoiceId, line.text, line.emotion || "neutral", stability);
        }

        if (!audioBuffer) {
          // ElevenLabs failed or quota exceeded — use Google TTS fallback
          const fallbackLocale = fallbackLocaleMap.get(charId) || "en-US";
          audioBuffer = await fallbackTTS(line.text, fallbackLocale);
        }

        if (audioBuffer) audioSegments.push(audioBuffer);
      }

      processedLines++;
      const progress = 30 + Math.floor((processedLines / totalLines) * 45);
      await updateProgress(
        projectId,
        progress,
        `Generating dialogue... (${processedLines}/${totalLines} lines)`,
      );
    }
  }

  // STEP 3: Generate scene images
  await updateProgress(projectId, 78, "Generating scene imagery...");

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

  // STEP 4: Mix audio
  await updateProgress(projectId, 88, "Mixing the final drama...");

  let finalAudioUrl: string | null = null;
  if (audioSegments.length > 0) {
    try {
      const combined = Buffer.concat(audioSegments);
      const base64Audio = combined.toString("base64");
      finalAudioUrl = `data:audio/mpeg;base64,${base64Audio}`;
      logger.info({ projectId, segmentCount: audioSegments.length, sizeKb: Math.round(combined.length / 1024) }, "Audio mixed successfully");
    } catch (err) {
      logger.error({ err }, "Audio mixing failed");
    }
  } else {
    logger.error({ projectId }, "No audio segments generated — all TTS calls failed");
  }

  await updateProgress(projectId, 95, "Finalizing your audio drama...");
  await new Promise(r => setTimeout(r, 500));

  await db
    .update(projectsTable)
    .set({
      status: finalAudioUrl ? "ready" : "error",
      finalAudioUrl,
      sceneImagesJson: sceneImages as unknown as object,
      generationProgress: 100,
      generationStep: finalAudioUrl ? "Complete!" : "Generation failed — all voice services unavailable",
    })
    .where(eq(projectsTable.id, projectId));

  logger.info({ projectId }, "Audio drama generation complete");
}
