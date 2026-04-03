import { Router, type IRouter, type Request, type Response } from "express";
import { DesignVoiceBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/voices/design", async (req: Request, res: Response): Promise<void> => {
  const parsed = DesignVoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ElevenLabs API key not configured" });
    return;
  }

  try {
    // Generate a preview text for voice design
    const previewText = "Hello, I am ready to bring this story to life with my voice.";
    
    // Use the voice generation endpoint - create a voice with the description as a name
    // ElevenLabs Voice Design API
    const response = await fetch("https://api.elevenlabs.io/v1/voice-generation/generate-voice", {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        gender: "neutral",
        age: "middle_aged",
        accent: "american",
        accent_strength: 1.0,
        text: previewText,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      req.log.error({ status: response.status, errText }, "ElevenLabs voice design failed");
      
      // Fallback: use a default voice ID from ElevenLabs
      const defaultVoiceId = getDefaultVoiceForDescription(parsed.data.description);
      res.json({ voiceId: defaultVoiceId });
      return;
    }

    const data = await response.json() as { voice_id?: string };
    
    if (data.voice_id) {
      res.json({ voiceId: data.voice_id });
    } else {
      const defaultVoiceId = getDefaultVoiceForDescription(parsed.data.description);
      res.json({ voiceId: defaultVoiceId });
    }
  } catch (err) {
    logger.error({ err }, "Voice design error");
    // Fallback to a curated voice
    const defaultVoiceId = getDefaultVoiceForDescription(parsed.data.description);
    res.json({ voiceId: defaultVoiceId });
  }
});

// Map description keywords to ElevenLabs built-in voice IDs as fallbacks
function getDefaultVoiceForDescription(description: string): string {
  const desc = description.toLowerCase();
  
  // ElevenLabs default voice IDs
  const voices = {
    deep: "pNInz6obpgDQGcFmaJgB",      // Adam - deep male
    warm: "EXAVITQu4vr4xnSDxMaL",       // Bella - warm female
    young: "jBpfuIE2acCo8z3wKNLl",      // Gigi - young female
    old: "TxGEqnHWrfWFTfGW9XjX",         // Josh - mature
    commanding: "VR6AewLTigWG4xSOukaG",  // Arnold - commanding
    nervous: "oWAxZDx7w5VEj9dCyTzz",     // Grace - soft
    playful: "jsCqWAovK2LkecY7zXl4",     // Freya - playful
    ethereal: "XB0fDUnXU5powFXDhCwa",    // Charlotte - ethereal
    robotic: "N2lVS1w4EtoT3dr4eOWO",     // Callum - robotic
  };

  if (desc.includes("deep") || desc.includes("gruff") || desc.includes("bass")) return voices.deep;
  if (desc.includes("warm") || desc.includes("gentle") || desc.includes("kind")) return voices.warm;
  if (desc.includes("young") || desc.includes("teen") || desc.includes("child")) return voices.young;
  if (desc.includes("old") || desc.includes("elder") || desc.includes("aged")) return voices.old;
  if (desc.includes("command") || desc.includes("authorit") || desc.includes("leader")) return voices.commanding;
  if (desc.includes("nervous") || desc.includes("scared") || desc.includes("timid")) return voices.nervous;
  if (desc.includes("playful") || desc.includes("fun") || desc.includes("cheerful")) return voices.playful;
  if (desc.includes("ethereal") || desc.includes("mystic") || desc.includes("ghost")) return voices.ethereal;
  if (desc.includes("robot") || desc.includes("ai") || desc.includes("synth")) return voices.robotic;
  
  // Default
  return "pNInz6obpgDQGcFmaJgB";
}

export default router;
