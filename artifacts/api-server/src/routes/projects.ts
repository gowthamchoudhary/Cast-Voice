import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db, projectsTable, storiesTable, userProfilesTable } from "@workspace/db";
import {
  GetProjectParams,
  CreateProjectBody,
  UpdateProjectParams,
  UpdateProjectBody,
  DeleteProjectParams,
  GenerateAudioDramaParams,
  GetGenerationStatusParams,
} from "@workspace/api-zod";
import { generateAudioDrama } from "../lib/generation";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/projects", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const profiles = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.replitUserId, req.user.id))
    .limit(1);

  if (profiles.length === 0) {
    res.json([]);
    return;
  }

  const rows = await db
    .select({
      project: projectsTable,
      storySceneImageUrl: storiesTable.sceneImageUrl,
      storySynopsis: storiesTable.synopsis,
    })
    .from(projectsTable)
    .leftJoin(storiesTable, eq(storiesTable.id, projectsTable.storyId))
    .where(eq(projectsTable.userId, profiles[0].id))
    .orderBy(projectsTable.createdAt);

  const projects = rows.map(({ project, storySceneImageUrl, storySynopsis }) => ({
    ...project,
    sceneImageUrl: storySceneImageUrl,
    synopsis: storySynopsis,
  }));

  res.json(projects);
});

router.post("/projects", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = CreateProjectBody.safeParse({
    castJson: {},
    ...req.body,
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Get user profile ID
  const profiles = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.replitUserId, req.user.id))
    .limit(1);

  if (profiles.length === 0) {
    // Auto-create profile from auth user data
    const displayName = req.user.firstName
      ? `${req.user.firstName} ${req.user.lastName || ""}`.trim()
      : req.user.id;
    const [newProfile] = await db
      .insert(userProfilesTable)
      .values({ replitUserId: req.user.id, displayName })
      .returning();
    profiles.push(newProfile);
  }
  const profileRow = profiles[0];

  // Get story info
  const [story] = await db
    .select()
    .from(storiesTable)
    .where(eq(storiesTable.id, parsed.data.storyId));

  if (!story) {
    res.status(404).json({ error: "Story not found" });
    return;
  }

  const [project] = await db
    .insert(projectsTable)
    .values({
      userId: profileRow.id,
      storyId: parsed.data.storyId,
      storyTitle: story.title,
      storyGenre: story.genre,
      castJson: parsed.data.castJson as object,
      status: "draft",
    })
    .returning();

  res.status(201).json(project);
});

router.get("/projects/:id", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id));

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Join story data so the cast/generate pages have characters, synopsis, sceneImageUrl
  const [story] = await db
    .select()
    .from(storiesTable)
    .where(eq(storiesTable.id, project.storyId));

  // Exclude finalAudioUrl from this response — audio is served via /api/projects/:id/audio
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { finalAudioUrl: _omit, ...projectWithoutAudio } = project;

  res.json({
    ...projectWithoutAudio,
    hasAudio: !!project.finalAudioUrl,
    story: story
      ? {
          id: story.id,
          title: story.title,
          genre: story.genre,
          synopsis: story.synopsis,
          characters: story.characters,
          sceneImageUrl: story.sceneImageUrl,
          scriptJson: story.scriptJson,
        }
      : null,
  });
});

// Dedicated audio streaming endpoint — returns raw MP3 bytes so the browser
// can stream it rather than loading a 1MB+ data URL embedded in JSON
router.get("/projects/:id/audio", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).end();
    return;
  }

  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).end();
    return;
  }

  const [project] = await db
    .select({ finalAudioUrl: projectsTable.finalAudioUrl, userId: projectsTable.userId })
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id));

  if (!project || !project.finalAudioUrl) {
    res.status(404).end();
    return;
  }

  // Strip the data URL prefix and decode base64 to binary
  const dataUrl = project.finalAudioUrl as string;
  const base64 = dataUrl.replace(/^data:audio\/mpeg;base64,/, "");
  const buffer = Buffer.from(base64, "base64");
  const total = buffer.length;

  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, max-age=3600");

  const rangeHeader = req.headers["range"];
  if (rangeHeader) {
    // Parse Range: bytes=start-end
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end   = match[2] ? parseInt(match[2], 10) : total - 1;
      const clampedEnd = Math.min(end, total - 1);
      const chunkSize  = clampedEnd - start + 1;

      res.setHeader("Content-Range",  `bytes ${start}-${clampedEnd}/${total}`);
      res.setHeader("Content-Length", chunkSize);
      res.status(206).end(buffer.slice(start, clampedEnd + 1));
      return;
    }
  }

  // Full response
  res.setHeader("Content-Length", total);
  res.status(200).end(buffer);
});

router.patch("/projects/:id", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateProjectBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.data.castJson !== undefined) updateData.castJson = body.data.castJson;
  if (body.data.status !== undefined) updateData.status = body.data.status;

  const [project] = await db
    .update(projectsTable)
    .set(updateData)
    .where(eq(projectsTable.id, params.data.id))
    .returning();

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.json(project);
});

// PUT alias so clients using PUT also work
router.put("/projects/:id", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateProjectBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.data.castJson !== undefined) updateData.castJson = body.data.castJson;
  if (body.data.status !== undefined) updateData.status = body.data.status;

  const [project] = await db
    .update(projectsTable)
    .set(updateData)
    .where(eq(projectsTable.id, params.data.id))
    .returning();

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.json(project);
});

router.delete("/projects/:id", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(projectsTable)
    .where(eq(projectsTable.id, params.data.id));

  res.sendStatus(204);
});

router.post("/projects/:id/generate", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = GenerateAudioDramaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id));

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  if (project.status === "generating") {
    res.status(400).json({ error: "Generation already in progress" });
    return;
  }

  // Update status to generating
  const [updated] = await db
    .update(projectsTable)
    .set({ status: "generating", generationProgress: 0, generationStep: "Starting generation..." })
    .where(eq(projectsTable.id, params.data.id))
    .returning();

  // Start generation in background (fire and forget)
  generateAudioDrama(params.data.id).catch((err) => {
    logger.error({ err, projectId: params.data.id }, "Audio drama generation failed");
    db.update(projectsTable)
      .set({ status: "failed", generationStep: "Generation failed" })
      .where(eq(projectsTable.id, params.data.id))
      .catch(() => {});
  });

  res.status(202).json(updated);
});

router.get("/projects/:id/status", async (req: Request, res: Response): Promise<void> => {
  const params = GetGenerationStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id));

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.json({
    status: project.status,
    progress: project.generationProgress ?? 0,
    currentStep: project.generationStep,
    finalAudioUrl: project.finalAudioUrl,
    sceneImagesJson: project.sceneImagesJson,
  });
});

export default router;
