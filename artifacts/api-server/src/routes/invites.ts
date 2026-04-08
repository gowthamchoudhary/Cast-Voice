import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, inviteLinksTable, projectsTable, storiesTable, userProfilesTable, voiceLibraryTable } from "@workspace/db";
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

  // Get the inviter's profile so we can record who created the invite
  const [inviterProfile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.replitUserId, req.user.id))
    .limit(1);

  const uuid = randomUUID();
  const [invite] = await db
    .insert(inviteLinksTable)
    .values({
      projectId: parsed.data.projectId,
      characterId: parsed.data.characterId,
      uuid,
      inviterProfileId: inviterProfile?.id ?? null,
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
  const character = characters.find((c) => c.id === invite.characterId) || {
    id: invite.characterId,
    name: "Character",
    description: "A character in the story",
  };

  // Get inviter's display name
  let inviterName = "Your friend";
  if (invite.inviterProfileId) {
    const [inviterProfile] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.id, invite.inviterProfileId));
    if (inviterProfile) inviterName = inviterProfile.displayName;
  }

  res.json({
    invite,
    character,
    storyTitle: project.storyTitle,
    inviterName,
    isFilled: !!invite.voiceCloneId,
    filledByName: invite.filledByName,
  });
});

router.post("/invites/:uuid/submit", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

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

  if (invite.voiceCloneId) {
    res.status(409).json({ error: "This invite has already been filled" });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ElevenLabs API key not configured" });
    return;
  }

  try {
    const dataUrl = body.data.audioDataUrl;
    const commaIdx = dataUrl.indexOf(",");
    if (commaIdx === -1) {
      res.status(400).json({ error: "Invalid audio data URL" });
      return;
    }

    // Get submitter's profile
    const [submitterProfile] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.replitUserId, req.user.id))
      .limit(1);

    // Attempt ElevenLabs voice cloning — but treat failures as non-fatal.
    // The audio is always stored so cloning can be retried at generation time.
    let voiceCloneId: string | null = null;

    try {
      const mimeMatch = dataUrl.match(/data:([^;]+);base64/);
      const mimeType = mimeMatch?.[1] ?? "audio/webm";
      const ext = mimeType.includes("mp3") ? "mp3" : mimeType.includes("wav") ? "wav" : "webm";
      const base64Data = dataUrl.slice(commaIdx + 1);
      const audioBuffer = Buffer.from(base64Data, "base64");
      const audioBlob = new Blob([audioBuffer], { type: mimeType });

      const formData = new FormData();
      formData.append("name", `${body.data.displayName} - ${invite.characterId}`);
      formData.append("description", `Voice clone for invite ${params.data.uuid}`);
      formData.append("files", audioBlob, `voice.${ext}`);

      const response = await fetch("https://api.elevenlabs.io/v1/voices/add", {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json() as { voice_id: string };
        voiceCloneId = data.voice_id;
        req.log.info({ voiceCloneId }, "Voice clone created successfully");
      } else {
        const errText = await response.text();
        req.log.warn({ status: response.status, errText }, "Voice clone failed — audio stored for retry");
      }
    } catch (cloneErr) {
      req.log.warn({ cloneErr }, "Voice clone request failed — audio stored for retry");
    }

    // Use a pending placeholder if cloning wasn't possible
    // "pending:<uuid>" signals that we have the audio but no ElevenLabs ID yet
    const effectiveVoiceId = voiceCloneId ?? `pending:${params.data.uuid}`;

    // Mark invite as filled — store audio for future retry
    const [updated] = await db
      .update(inviteLinksTable)
      .set({
        voiceCloneId: effectiveVoiceId,
        filledByUserId: submitterProfile?.id ?? null,
        filledByName: body.data.displayName,
        audioDataUrl: dataUrl,
      })
      .where(eq(inviteLinksTable.uuid, params.data.uuid))
      .returning();

    // Update the project's castJson.voices so the caster sees the submission
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, invite.projectId));

    if (project) {
      const existingCast = (project.castJson as { voices?: Record<string, unknown> }) || {};
      const voices = existingCast.voices || {};
      voices[invite.characterId] = {
        characterId: invite.characterId,
        voiceType: "invite",
        elevenLabsVoiceId: effectiveVoiceId,
        inviteName: body.data.displayName,
        inviteUuid: params.data.uuid,
      };
      await db
        .update(projectsTable)
        .set({ castJson: { ...existingCast, voices } })
        .where(eq(projectsTable.id, invite.projectId));
    }

    // Add to the inviter's Voice Library (with or without a real clone ID)
    if (invite.inviterProfileId) {
      await db.insert(voiceLibraryTable).values({
        ownerUserId: invite.inviterProfileId,
        personName: body.data.displayName,
        role: invite.characterId,
        group: "Invited Friends",
        elevenLabsVoiceId: voiceCloneId ?? undefined,
        inviteUuid: params.data.uuid,
      });
    }

    res.json({
      success: true,
      invite: updated,
      voiceCloneId: effectiveVoiceId,
      cloned: !!voiceCloneId,
    });
  } catch (err) {
    logger.error({ err }, "Invite voice submit error");
    res.status(500).json({ error: "Failed to submit voice" });
  }
});

export default router;
