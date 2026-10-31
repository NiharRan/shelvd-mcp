import { z } from "zod";

// Placeholder until the hosted app has a real URL.
export const UPGRADE_URL = "https://shelvd.dev/pro";

export const TOOLS = {
  park: "park_idea",
  list: "list_ideas",
  get: "get_idea",
  complete: "complete_idea",
  snooze: "snooze_idea",
  delete: "delete_idea",
  clear: "clear_ideas",
  update: "update_idea",
  search: "search_ideas",
  start: "start_idea",
} as const;

export const parkIdeaInput = {
  title: z.string().min(1).max(200),
  details: z.string().max(5000).optional(),
  project: z.string().max(80).optional(),
  due: z.string().optional().describe("ISO date or natural text like 'friday 3pm'"),
  nagEveryMinutes: z.number().int().positive().optional(),
  context: z
    .object({
      source: z.string().optional(),
      repo: z.string().optional(),
      branch: z.string().optional(),
      files: z.array(z.string()).max(20).optional(),
      summary: z.string().max(1000).optional(),
    })
    .optional(),
};

export const listIdeasInput = {
  project: z.string().optional(),
  status: z.enum(["parked", "due", "snoozed", "done", "all"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().positive().max(200).optional(),
};

export const idInput = { id: z.string().min(1) };

export const snoozeIdeaInput = {
  id: z.string().min(1),
  until: z.string().optional(),
  minutes: z.number().int().positive().optional(),
};

export const clearIdeasInput = {
  scope: z.string().describe("'done', 'all', or 'project:<name>'"),
  confirm: z.boolean().optional(),
};

export const updateIdeaInput = {
  id: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  details: z.string().max(5000).optional(),
  project: z.string().max(80).optional(),
  due: z.string().optional().describe("ISO date or natural text like 'friday 3pm'"),
  note: z.string().min(1).max(1000).optional().describe("Appended to the idea's notes"),
};

export const searchIdeasInput = {
  query: z.string().min(1),
  status: listIdeasInput.status,
  limit: listIdeasInput.limit,
};

export type ParkIdeaInput = z.infer<z.ZodObject<typeof parkIdeaInput>>;
export type ListIdeasInput = z.infer<z.ZodObject<typeof listIdeasInput>>;
export type UpdateIdeaInput = z.infer<z.ZodObject<typeof updateIdeaInput>>;
export type SearchIdeasInput = z.infer<z.ZodObject<typeof searchIdeasInput>>;
export type SnoozeIdeaInput = z.infer<z.ZodObject<typeof snoozeIdeaInput>>;
export type ClearIdeasInput = z.infer<z.ZodObject<typeof clearIdeasInput>>;

export type IdeaStatus = "parked" | "snoozed" | "done";

export interface Idea {
  id: string;
  title: string;
  details?: string;
  project: string;
  status: IdeaStatus;
  dueAt: string | null; // UTC ISO
  nagEveryMinutes?: number;
  context?: ParkIdeaInput["context"];
  notes: string[];
  history: { at: string; event: string }[];
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Result of every tool: a human line first, then structured JSON. */
export interface ToolResult {
  text: string;
  data?: unknown;
  isError?: boolean;
}
