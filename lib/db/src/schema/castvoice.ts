import { pgTable, text, serial, timestamp, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userProfilesTable = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  replitUserId: text("replit_user_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: text("role"),
  group: text("group"),
  voiceCloneId: text("voice_clone_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserProfileSchema = createInsertSchema(userProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfilesTable.$inferSelect;

export const storiesTable = pgTable("stories", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  genre: text("genre").notNull(),
  synopsis: text("synopsis"),
  characters: jsonb("characters").notNull().$type<Array<{ id: string; name: string; description: string }>>(),
  sceneImageUrl: text("scene_image_url"),
  sceneImagePrompt: text("scene_image_prompt"),
  scriptJson: jsonb("script_json").notNull().$type<object>(),
  isCustom: boolean("is_custom").default(false),
  rawText: text("raw_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStorySchema = createInsertSchema(storiesTable).omit({ id: true, createdAt: true });
export type InsertStory = z.infer<typeof insertStorySchema>;
export type Story = typeof storiesTable.$inferSelect;

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  storyId: integer("story_id").notNull(),
  storyTitle: text("story_title").notNull(),
  storyGenre: text("story_genre").notNull(),
  castJson: jsonb("cast_json").notNull().$type<object>(),
  status: text("status").notNull().default("draft"),
  finalAudioUrl: text("final_audio_url"),
  sceneImagesJson: jsonb("scene_images_json").$type<object>(),
  generationProgress: integer("generation_progress"),
  generationStep: text("generation_step"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;

export const inviteLinksTable = pgTable("invite_links", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  characterId: text("character_id").notNull(),
  uuid: text("uuid").notNull().unique(),
  inviterProfileId: integer("inviter_profile_id"),
  filledByUserId: integer("filled_by_user_id"),
  filledByName: text("filled_by_name"),
  voiceCloneId: text("voice_clone_id"),
  audioDataUrl: text("audio_data_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInviteLinkSchema = createInsertSchema(inviteLinksTable).omit({ id: true, createdAt: true });
export type InsertInviteLink = z.infer<typeof insertInviteLinkSchema>;
export type InviteLink = typeof inviteLinksTable.$inferSelect;

export const voiceLibraryTable = pgTable("voice_library", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("owner_user_id").notNull(),
  personName: text("person_name").notNull(),
  role: text("role"),
  group: text("group"),
  elevenLabsVoiceId: text("eleven_labs_voice_id"),
  inviteUuid: text("invite_uuid"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVoiceLibrarySchema = createInsertSchema(voiceLibraryTable).omit({ id: true, createdAt: true });
export type InsertVoiceLibrary = z.infer<typeof insertVoiceLibrarySchema>;
export type VoiceLibrary = typeof voiceLibraryTable.$inferSelect;
