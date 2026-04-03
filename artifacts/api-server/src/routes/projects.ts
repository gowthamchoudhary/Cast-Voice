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

  const projects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.userId, profiles[0].id))
    .orderBy(projectsTable.createdAt);

  res.json(projects);
});

router.post("/projects", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = CreateProjectBody.safeParse(req.body);
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

  res.json(project);
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
