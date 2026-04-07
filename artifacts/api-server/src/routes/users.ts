import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, userProfilesTable, voiceLibraryTable } from "@workspace/db";
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
    const [profile] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.replitUserId, req.user.id));

    const voiceName = displayName || profile?.displayName || req.user.id;

    const formData = new FormData();
    formData.append("name", voiceName);
    formData.append("description", `Voice profile for ${voiceName}`);

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

router.post("/users/voice-library", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { personName, group, role, samples } = req.body as {
    personName?: string;
    group?: string;
    role?: string;
    samples?: string[];
  };

  if (!personName || typeof personName !== "string" || personName.trim().length === 0) {
    res.status(400).json({ error: "Person name is required" });
    return;
  }
  if (!samples || !Array.isArray(samples) || samples.length === 0) {
    res.status(400).json({ error: "At least one audio sample is required" });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ElevenLabs API key not configured" });
    return;
  }

  try {
    let profile = (
      await db.select().from(userProfilesTable).where(eq(userProfilesTable.replitUserId, req.user.id))
    )[0];

    if (!profile) {
      [profile] = await db
        .insert(userProfilesTable)
        .values({ replitUserId: req.user.id, displayName: req.user.id })
        .returning();
    }

    const voiceName = `${personName.trim()} (${req.user.id})`;
    const formData = new FormData();
    formData.append("name", voiceName);
    formData.append("description", `Voice for ${personName.trim()} — added manually`);

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
      logger.error({ status: response.status, errText }, "ElevenLabs voice clone failed for library entry");
      res.status(500).json({ error: "Voice cloning failed: " + errText });
      return;
    }

    const data = await response.json() as { voice_id: string };

    const [entry] = await db
      .insert(voiceLibraryTable)
      .values({
        ownerUserId: profile.id,
        personName: personName.trim(),
        role: role?.trim() || null,
        group: group?.trim() || "Other",
        elevenLabsVoiceId: data.voice_id,
        inviteUuid: null,
      })
      .returning();

    res.json(entry);
  } catch (err) {
    logger.error({ err }, "Voice library manual add error");
    res.status(500).json({ error: "Failed to add voice to library" });
  }
});

router.get("/users/voice-library", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.replitUserId, req.user.id));

  if (!profile) {
    res.json([]);
    return;
  }

  const library = await db
    .select()
    .from(voiceLibraryTable)
    .where(eq(voiceLibraryTable.ownerUserId, profile.id))
    .orderBy(voiceLibraryTable.createdAt);

  res.json(library);
});

router.delete("/users/voice-library/:id", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const libId = parseInt(req.params.id, 10);
  if (isNaN(libId)) {
    res.status(400).json({ error: "Invalid ID" });
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

  await db
    .delete(voiceLibraryTable)
    .where(and(eq(voiceLibraryTable.id, libId), eq(voiceLibraryTable.ownerUserId, profile.id)));

  res.status(204).end();
});

router.get("/voices/:voiceId/sample", async (req: Request, res: Response): Promise<void> => {
  const { voiceId } = req.params;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ElevenLabs API key not configured" });
    return;
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "Hello, this is a preview of my voice.",
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      req.log.error({ status: response.status, errText }, "ElevenLabs TTS preview failed");
      res.status(500).json({ error: "Voice preview failed" });
      return;
    }

    const audioBuffer = await response.arrayBuffer();
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(audioBuffer));
  } catch (err) {
    logger.error({ err }, "Voice sample error");
    res.status(500).json({ error: "Failed to generate voice sample" });
  }
});

export default router;
