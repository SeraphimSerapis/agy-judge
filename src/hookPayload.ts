import { z } from "zod";

/**
 * Zod schema for the Antigravity CLI Stop hook stdin payload.
 *
 * The Stop hook is the only documented hook contract this project currently
 * parses. PreInvocation and PostToolUse payloads are intentionally not
 * modeled here. New fields are accepted (passthrough) so a future Antigravity
 * CLI version doesn't break the hook, but a missing required field is
 * rejected so silent behavior changes are caught at parse time.
 */
export const stopHookInputSchema = z
  .object({
    executionNum: z.number().int().nonnegative().optional(),
    terminationReason: z.string().optional(),
    error: z.string().optional(),
    fullyIdle: z.boolean().optional(),
    conversationId: z.string().optional(),
    workspacePaths: z.array(z.string()).optional(),
    transcriptPath: z.string().optional(),
    artifactDirectoryPath: z.string().optional(),
  })
  .passthrough();

export type StopHookInput = z.infer<typeof stopHookInputSchema>;

/** Antigravity CLI Stop hook stdout response. */
export interface StopHookOutput {
  decision: "continue" | "";
  reason?: string;
}

export function parseStopHookInput(text: string): StopHookInput {
  const parsed = JSON.parse(text);
  return stopHookInputSchema.parse(parsed);
}

export function tryParseStopHookInput(text: string): { ok: true; value: StopHookInput } | { ok: false; error: string } {
  try {
    return { ok: true, value: parseStopHookInput(text) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
