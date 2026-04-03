import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, userProfilesTable } from "@workspace/db";
import { GetUserProfileResponse, UpdateUserProfileBody, UpdateUserProfileResponse, CloneUserVoiceBody, CloneUserVoiceResponse } from "@workspace/api-zod";
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

router.post("/users/voice", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = CloneUserVoiceBody.safeParse(req.body);
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
    // Convert data URL to Buffer
    const dataUrl = parsed.data.audioDataUrl;
    const base64Data = dataUrl.split(",")[1];
    if (!base64Data) {
      res.status(400).json({ error: "Invalid audio data URL" });
      return;
    }

    const audioBuffer = Buffer.from(base64Data, "base64");
    const blob = new Blob([audioBuffer], { type: "audio/wav" });

    const formData = new FormData();
    formData.append("name", parsed.data.displayName);
    formData.append("description", `Voice profile for ${parsed.data.displayName}`);
    formData.append("files", blob, parsed.data.fileName);

    const response = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      req.log.error({ status: response.status, errText }, "ElevenLabs voice clone failed");
      res.status(500).json({ error: "Voice cloning failed" });
      return;
    }

    const data = await response.json() as { voice_id: string };
    const voiceCloneId = data.voice_id;

    // Update user profile with voice clone ID
    await db
      .update(userProfilesTable)
      .set({ voiceCloneId, updatedAt: new Date() })
      .where(eq(userProfilesTable.replitUserId, req.user.id));

    res.json(CloneUserVoiceResponse.parse({ voiceCloneId }));
  } catch (err) {
    logger.error({ err }, "Voice cloning error");
    res.status(500).json({ error: "Voice cloning failed" });
  }
});

export default router;
