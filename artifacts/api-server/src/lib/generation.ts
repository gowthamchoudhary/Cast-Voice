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

async function elevenLabsTTS(
  voiceId: string,
  text: string,
  emotion: string,
  stability: number,
): Promise<Buffer | null> {
  if (!ELEVENLABS_API_KEY) return null;

  const style = emotionToStyle(emotion);

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
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
          similarity_boost: 0.8,
          style,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      logger.warn({ status: response.status, voiceId, emotion }, "TTS request failed");
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
  if (!ELEVENLABS_API_KEY) return null;

  try {
    const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
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
    });

    if (!response.ok) {
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
  if (!ELEVENLABS_API_KEY) return getDefaultVoice(description);

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

  // Look up owner's voice clone ID for user_clone assignments
  const [ownerProfile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.replitUserId, project.userId));

  const ownerVoiceCloneId = ownerProfile?.voiceCloneId;

  const castJson = (project.castJson as Record<string, CastEntry>) || {};
  const script = story.scriptJson as { scenes: ScriptScene[] };
  const scenes: ScriptScene[] = script?.scenes || [];
  const storyCharacters = (story.characters as Array<{ id: string; name: string; description: string }>) || [];

  const charNameToId = new Map<string, string>();
  for (const char of storyCharacters) {
    charNameToId.set(char.name, char.id);
  }

  // STEP 1: Resolve voices for all characters
  await updateProgress(projectId, 5, "Designing character voices...");

  const voiceMap = new Map<string, string>(); // characterId -> voiceId

  for (const char of storyCharacters) {
    const castEntry = castJson[char.id];
    if (!castEntry) {
      // No cast entry — fall back to AI design from character description
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
        // Already designed during cast setup
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
      // Look up the invite to get the cloned voice ID
      if (castEntry.inviteUuid) {
        const [invite] = await db
          .select()
          .from(inviteLinksTable)
          .where(eq(inviteLinksTable.uuid, castEntry.inviteUuid));
        if (invite?.voiceCloneId) {
          voiceMap.set(char.id, invite.voiceCloneId);
        } else {
          // Invite not filled yet — use character description to design
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

  await updateProgress(projectId, 20, "Writing emotional delivery for each line...");
  await new Promise(r => setTimeout(r, 800));

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
      const voiceId = charId ? voiceMap.get(charId) : undefined;

      if (voiceId && line.text) {
        const stability = line.stability ?? 0.5;
        const audioBuffer = await elevenLabsTTS(voiceId, line.text, line.emotion || "neutral", stability);
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
    } catch (err) {
      logger.error({ err }, "Audio mixing failed");
    }
  }

  await updateProgress(projectId, 95, "Finalizing your audio drama...");
  await new Promise(r => setTimeout(r, 500));

  await db
    .update(projectsTable)
    .set({
      status: "ready",
      finalAudioUrl,
      sceneImagesJson: sceneImages as unknown as object,
      generationProgress: 100,
      generationStep: "Complete!",
    })
    .where(eq(projectsTable.id, projectId));

  logger.info({ projectId }, "Audio drama generation complete");
}
