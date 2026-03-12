import { z } from "zod";

export const formatCodeSchema = z
  .string()
  .trim()
  .min(3)
  .max(20)
  .regex(/^[A-Z0-9/-]+$/);

export const createMatchSchema = z.object({
  groupId: z.string().cuid(),
  source: z.enum(["manual", "import"]),
  playerAName: z.string().trim().min(1).max(80),
  playerBName: z.string().trim().min(1).max(80),
  archetypeA: z.string().trim().min(1).max(120),
  archetypeB: z.string().trim().min(1).max(120),
  winnerSide: z.enum(["A", "B"]),
  gameType: z.enum([
    "in_person_testing",
    "cup",
    "challenge",
    "regional",
    "international",
    "tcg_live_ladder",
    "other"
  ]),
  notes: z.string().trim().max(1200).optional(),
  formatCode: formatCodeSchema
});

export const updateMatchResultSchema = z.object({
  groupId: z.string().cuid(),
  matchId: z.string().cuid(),
  archetypeA: z.string().trim().min(1).max(120),
  archetypeB: z.string().trim().min(1).max(120),
  winnerSide: z.enum(["A", "B"])
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  inviteCode: z
    .string()
    .trim()
    .toUpperCase()
    .min(4)
    .max(24)
    .regex(/^[A-Z0-9-]+$/)
});

export const joinGroupSchema = z.object({
  inviteCode: z.string().trim().min(4).max(24)
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  displayName: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined))
});

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  tcgLiveUsername: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined))
});
