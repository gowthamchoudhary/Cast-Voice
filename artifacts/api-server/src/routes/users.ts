import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, userProfilesTable } from "@workspace/db";
import { GetUserProfileResponse, UpdateUserProfileBody, UpdateUserProfileResponse, CloneUserVoiceResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/users/profile", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.replitUserId, req.user.id));

  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json(GetUserProfileResponse.parse(profile));
});

router.put("/users/profile", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = UpdateUserProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.replitUserId, req.user.id));

  let profile;
  if (existing.length > 0) {
    [profile] = await db
      .update(userProfilesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(userProfilesTable.replitUserId, req.user.id))
      .returning();
  } else {
    [profile] = await db
      .insert(userProfilesTable)
      .values({ ...parsed.data, replitUserId: req.user.id })
      .returning();
  }

  res.json(UpdateUserProfileResponse.parse(profile));
});

// Accepts multipart form data with "samples" files (from file picker or live recording)
// Frontend converts files to base64 data URLs and sends JSON: { samples: string[], displayName: string }
router.post("/users/voice-clone", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { samples, displayName } = req.body as { samples?: string[]; displayName?: string };
  if (!samples || !Array.isArray(samples) || samples.length === 0) {
    res.status(400).json({ error: "At least one voice sample is required" });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ElevenLabs API key not configured" });
    return;
  }

  try {
    // Get user's display name for the voice label
    const [profile] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.replitUserId, req.user.id));

    const voiceName = displayName || profile?.displayName || req.user.id;

    const formData = new FormData();
    formData.append("name", voiceName);
    formData.append("description", `Voice profile for ${voiceName}`);

    // Convert each base64 data URL to a blob and attach
    for (let i = 0; i < samples.length; i++) {
      const dataUrl = samples[i];
      const commaIdx = dataUrl.indexOf(",");
      if (commaIdx === -1) continue;
      const mimeMatch = dataUrl.match(/data:([^;]+);base64/);
      const mimeType = mimeMatch?.[1] ?? "audio/webm";
      const ext = mimeType.includes("mp3") ? "mp3" : mimeType.includes("wav") ? "wav" : "webm";
      const base64Data = dataUrl.slice(commaIdx + 1);
      const audioBuffer = Buffer.from(base64Data, "base64");
      const blob = new Blob([audioBuffer], { type: mimeType });
      formData.append("files", blob, `sample_${i + 1}.${ext}`);
    }

    const response = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      req.log.error({ status: response.status, errText }, "ElevenLabs voice clone failed");
      res.status(500).json({ error: "Voice cloning failed: " + errText });
      return;
    }

    const data = await response.json() as { voice_id: string };
    const voiceCloneId = data.voice_id;

    // Upsert profile with voice clone ID
    if (profile) {
      await db
        .update(userProfilesTable)
        .set({ voiceCloneId, updatedAt: new Date() })
        .where(eq(userProfilesTable.replitUserId, req.user.id));
    } else {
      await db
        .insert(userProfilesTable)
        .values({ replitUserId: req.user.id, displayName: voiceName, voiceCloneId });
    }

    res.json(CloneUserVoiceResponse.parse({ voiceCloneId }));
  } catch (err) {
    logger.error({ err }, "Voice cloning error");
    res.status(500).json({ error: "Voice cloning failed" });
  }
});

export default router;
