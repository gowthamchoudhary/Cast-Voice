import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/voices/design", async (req: Request, res: Response): Promise<void> => {
  const { description, characterName } = req.body as { description?: string; characterName?: string };
  if (!description || typeof description !== "string" || description.trim().length < 3) {
    res.status(400).json({ error: "A voice description is required (at least 3 characters)." });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    const fallbackId = getDefaultVoiceForDescription(description);
    res.json({ voiceId: fallbackId });
    return;
  }

  const previewText = `Hello. I am ${characterName || "a character"}, ready to bring this story to life.`;

  try {
    const response = await fetch("https://api.elevenlabs.io/v1/voice-generation/generate-voice", {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        voice_description: description.trim(),
        text: previewText,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.warn({ status: response.status, errText }, "ElevenLabs voice design API failed, using fallback");
      res.json({ voiceId: getDefaultVoiceForDescription(description) });
      return;
    }

    const data = await response.json() as { voice_id?: string; previews?: Array<{ audio_base_64?: string }> };

    if (data.voice_id) {
      res.json({ voiceId: data.voice_id, preview: data.previews?.[0]?.audio_base_64 });
    } else {
      res.json({ voiceId: getDefaultVoiceForDescription(description) });
    }
  } catch (err) {
    logger.error({ err }, "Voice design error");
    res.json({ voiceId: getDefaultVoiceForDescription(description) });
  }
});

function getDefaultVoiceForDescription(description: string): string {
  const desc = (description || "").toLowerCase();
  if (desc.includes("deep") || desc.includes("gruff") || desc.includes("bass") || desc.includes("baritone")) return "pNInz6obpgDQGcFmaJgB";
  if (desc.includes("warm") || desc.includes("gentle") || desc.includes("kind") || desc.includes("feminine")) return "EXAVITQu4vr4xnSDxMaL";
  if (desc.includes("young") || desc.includes("teen") || desc.includes("child") || desc.includes("energetic")) return "jBpfuIE2acCo8z3wKNLl";
  if (desc.includes("old") || desc.includes("elder") || desc.includes("aged") || desc.includes("gravelly")) return "TxGEqnHWrfWFTfGW9XjX";
  if (desc.includes("command") || desc.includes("authorit") || desc.includes("leader") || desc.includes("villain")) return "VR6AewLTigWG4xSOukaG";
  if (desc.includes("nervous") || desc.includes("scared") || desc.includes("timid") || desc.includes("soft")) return "oWAxZDx7w5VEj9dCyTzz";
  if (desc.includes("playful") || desc.includes("fun") || desc.includes("cheerful") || desc.includes("bright")) return "jsCqWAovK2LkecY7zXl4";
  if (desc.includes("ethereal") || desc.includes("mystic") || desc.includes("ghost") || desc.includes("mysterious")) return "XB0fDUnXU5powFXDhCwa";
  if (desc.includes("robot") || desc.includes("synth") || desc.includes("ai ") || desc.includes("android")) return "N2lVS1w4EtoT3dr4eOWO";
  return "pNInz6obpgDQGcFmaJgB";
}

export default router;
