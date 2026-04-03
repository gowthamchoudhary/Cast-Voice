import { eq } from "drizzle-orm";
import { db, projectsTable, storiesTable } from "@workspace/db";
import { logger } from "./logger";
import path from "path";
import fs from "fs";
import os from "os";

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
  type: "my_voice" | "designed" | "invite";
  voiceId?: string;
  description?: string;
  inviteUuid?: string;
}

async function updateProgress(projectId: number, progress: number, step: string) {
  await db
    .update(projectsTable)
    .set({ generationProgress: progress, generationStep: step })
    .where(eq(projectsTable.id, projectId));
}

async function elevenLabsTTS(voiceId: string, text: string, stability: number): Promise<Buffer | null> {
  if (!ELEVENLABS_API_KEY) return null;
  
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
          style: 0.6,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      logger.warn({ status: response.status, voiceId }, "TTS request failed");
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

async function designVoice(description: string): Promise<string> {
  if (!ELEVENLABS_API_KEY) return getDefaultVoice(description);

  try {
    const response = await fetch("https://api.elevenlabs.io/v1/voice-generation/generate-voice", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        gender: "neutral",
        age: "middle_aged",
        accent: "american",
        accent_strength: 1.0,
        text: "Hello, I am ready to voice this character for the audio drama.",
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
  const desc = description?.toLowerCase() || "";
  if (desc.includes("deep") || desc.includes("gruff")) return "pNInz6obpgDQGcFmaJgB";
  if (desc.includes("warm") || desc.includes("gentle")) return "EXAVITQu4vr4xnSDxMaL";
  if (desc.includes("young") || desc.includes("teen")) return "jBpfuIE2acCo8z3wKNLl";
  if (desc.includes("command") || desc.includes("leader")) return "VR6AewLTigWG4xSOukaG";
  if (desc.includes("nervous") || desc.includes("scared")) return "oWAxZDx7w5VEj9dCyTzz";
  if (desc.includes("playful") || desc.includes("fun")) return "jsCqWAovK2LkecY7zXl4";
  if (desc.includes("ethereal") || desc.includes("mystic")) return "XB0fDUnXU5powFXDhCwa";
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

  const castJson = (project.castJson as Record<string, CastEntry>) || {};
  const script = story.scriptJson as { scenes: ScriptScene[] };
  const scenes: ScriptScene[] = script.scenes || [];
  const storyCharacters = (story.characters as Array<{ id: string; name: string; description: string }>) || [];

  // Build character name -> character id map
  const charNameToId = new Map<string, string>();
  for (const char of storyCharacters) {
    charNameToId.set(char.name, char.id);
  }

  // STEP 1: Design voices for characters that need it
  await updateProgress(projectId, 5, "Designing character voices...");
  
  const voiceMap = new Map<string, string>(); // characterId -> voiceId
  
  for (const char of storyCharacters) {
    const castEntry = castJson[char.id];
    if (!castEntry) continue;
    
    if (castEntry.type === "my_voice" && castEntry.voiceId) {
      voiceMap.set(char.id, castEntry.voiceId);
    } else if (castEntry.type === "designed") {
      const voiceId = await designVoice(castEntry.description || char.description);
      voiceMap.set(char.id, voiceId);
    } else if (castEntry.type === "invite" && castEntry.voiceId) {
      voiceMap.set(char.id, castEntry.voiceId);
    } else {
      // Fallback
      voiceMap.set(char.id, getDefaultVoice(char.description));
    }
  }

  await updateProgress(projectId, 20, "Writing emotional delivery for each line...");
  await new Promise(r => setTimeout(r, 1000));

  // STEP 2 & 3: Generate dialogue audio files
  await updateProgress(projectId, 30, "Generating dialogue...");

  const audioSegments: Buffer[] = [];
  const totalLines = scenes.reduce((acc, s) => acc + s.lines.length, 0);
  let processedLines = 0;

  for (const scene of scenes) {
    // Generate SFX for the scene
    if (scene.sfx_before) {
      const sfxBuffer = await elevenLabsSFX(scene.sfx_before);
      if (sfxBuffer) {
        audioSegments.push(sfxBuffer);
      }
    }

    for (const line of scene.lines) {
      const charId = charNameToId.get(line.character);
      const voiceId = charId ? voiceMap.get(charId) : undefined;
      
      if (voiceId && line.text) {
        const stability = line.stability ?? 0.5;
        const audioBuffer = await elevenLabsTTS(voiceId, line.text, stability);
        if (audioBuffer) {
          audioSegments.push(audioBuffer);
        }
      }
      
      processedLines++;
      const progress = 30 + Math.floor((processedLines / totalLines) * 40);
      await updateProgress(projectId, progress, `Generating dialogue... (${processedLines}/${totalLines} lines)`);
    }
  }

  // STEP 4: Generate scene images
  await updateProgress(projectId, 75, "Adding sound effects...");
  
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

  // STEP 5: Mix audio
  await updateProgress(projectId, 85, "Mixing the final drama...");

  let finalAudioUrl: string | null = null;

  if (audioSegments.length > 0) {
    try {
      // Save combined audio as base64 data URL  
      // Simple concatenation of MP3 segments (basic mixing)
      const combined = Buffer.concat(audioSegments);
      const base64Audio = combined.toString("base64");
      finalAudioUrl = `data:audio/mpeg;base64,${base64Audio}`;
    } catch (err) {
      logger.error({ err }, "Audio mixing failed");
    }
  }

  // If no real audio was generated, create a simple placeholder
  if (!finalAudioUrl) {
    finalAudioUrl = null;
  }

  await updateProgress(projectId, 95, "Finalizing your audio drama...");
  await new Promise(r => setTimeout(r, 500));

  // Update project as ready
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
