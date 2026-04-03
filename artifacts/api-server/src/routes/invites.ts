import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, inviteLinksTable, projectsTable, storiesTable, userProfilesTable } from "@workspace/db";
import { CreateInviteLinkBody, GetInviteLinkParams, SubmitInviteVoiceParams, SubmitInviteVoiceBody } from "@workspace/api-zod";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/invites", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = CreateInviteLinkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const uuid = randomUUID();

  const [invite] = await db
    .insert(inviteLinksTable)
    .values({
      projectId: parsed.data.projectId,
      characterId: parsed.data.characterId,
      uuid,
    })
    .returning();

  res.status(201).json(invite);
});

router.get("/invites/:uuid", async (req: Request, res: Response): Promise<void> => {
  const params = GetInviteLinkParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [invite] = await db
    .select()
    .from(inviteLinksTable)
    .where(eq(inviteLinksTable.uuid, params.data.uuid));

  if (!invite) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }

  // Get project and story info
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, invite.projectId));

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const [story] = await db
    .select()
    .from(storiesTable)
    .where(eq(storiesTable.id, project.storyId));

  const characters = (story?.characters as Array<{ id: string; name: string; description: string }>) || [];
  const character = characters.find(c => c.id === invite.characterId) || {
    id: invite.characterId,
    name: "Character",
    description: "A character in the story",
  };

  res.json({
    invite,
    character,
    storyTitle: project.storyTitle,
    isFilled: !!invite.voiceCloneId,
  });
});

router.post("/invites/:uuid/submit", async (req: Request, res: Response): Promise<void> => {
  const params = SubmitInviteVoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = SubmitInviteVoiceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [invite] = await db
    .select()
    .from(inviteLinksTable)
    .where(eq(inviteLinksTable.uuid, params.data.uuid));

  if (!invite) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ElevenLabs API key not configured" });
    return;
  }

  try {
    const dataUrl = body.data.audioDataUrl;
    const base64Data = dataUrl.split(",")[1];
    if (!base64Data) {
      res.status(400).json({ error: "Invalid audio data URL" });
      return;
    }

    const audioBuffer = Buffer.from(base64Data, "base64");
    const audioBlob = new Blob([audioBuffer], { type: "audio/wav" });

    const formData = new FormData();
    formData.append("name", `${body.data.displayName} - ${invite.characterId}`);
    formData.append("description", `Voice for character ${invite.characterId}`);
    formData.append("files", audioBlob, "voice.wav");

    const response = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      req.log.error({ status: response.status, errText }, "Voice clone failed");
      res.status(500).json({ error: "Voice cloning failed" });
      return;
    }

    const data = await response.json() as { voice_id: string };
    const voiceCloneId = data.voice_id;

    // Get user profile if authenticated
    let filledByUserId: number | undefined;
    if (req.isAuthenticated()) {
      const profileRows = await db
        .select()
        .from(userProfilesTable)
        .where(eq(userProfilesTable.replitUserId, req.user.id))
        .limit(1);
      if (profileRows[0]) filledByUserId = profileRows[0].id;
    }

    const [updated] = await db
      .update(inviteLinksTable)
      .set({ voiceCloneId, filledByUserId })
      .where(eq(inviteLinksTable.uuid, params.data.uuid))
      .returning();

    // Also update the project's castJson with this voice
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, invite.projectId));

    if (project) {
      const castJson = (project.castJson as Record<string, unknown>) || {};
      castJson[invite.characterId] = {
        type: "invite",
        voiceId: voiceCloneId,
        inviteUuid: params.data.uuid,
      };
      await db
        .update(projectsTable)
        .set({ castJson })
        .where(eq(projectsTable.id, invite.projectId));
    }

    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Invite voice submit error");
    res.status(500).json({ error: "Failed to submit voice" });
  }
});

export default router;
