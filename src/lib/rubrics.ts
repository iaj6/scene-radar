// Platform-graded outcomes (user.define_outcome). A graded kickoff sends the task WITH
// its rubric; the Managed Agents grader scores the deliverable when the agent finishes
// and sends it back to revise (up to MAX_ITERATIONS) if criteria aren't met. Verdicts
// stream as span.outcome_evaluation_end and persist on session.outcome_evaluations.
//
// Grading a sweep is worth the extra turns here specifically because the failure mode
// is a fabricated date — a grader that re-reads the sweep against the verification
// contract is a second pair of eyes on exactly the thing that costs a wasted trip.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type GradedAgent = "radar";

const FILES: Record<GradedAgent, string> = {
  radar: "scene-radar.rubric.md",
};

// Evaluate→revise cycles before the grader gives up (default 3, max 20).
// Kept low — every revision is another full research turn.
export const MAX_ITERATIONS = 2;

export function rubric(agent: GradedAgent): string {
  return readFileSync(resolve(__dirname, "../../agents/rubrics", FILES[agent]), "utf8");
}

export const DELIVERABLE_FILENAME = "deliverable.md";

// The sweep report is read by a human out of the transcript, so it stays in-message.
// The parallel deliverable file exists for anything that ingests sweeps later (a shows
// board, a digest agent) without re-parsing the message log.
const DELIVERY =
  `\n\nDelivery: output the COMPLETE sweep report as your final message — not only as ` +
  `a file. Also write the same report, machine-readable blocks included, to ` +
  `/mnt/session/outputs/${DELIVERABLE_FILENAME}.`;

// The graded kickoff event. `description` IS the task — the agent begins work on
// receipt — so this replaces a plain user.message.
export function defineOutcome(agent: GradedAgent, description: string) {
  return {
    type: "user.define_outcome" as const,
    description: description + DELIVERY,
    rubric: { type: "text" as const, content: rubric(agent) },
    max_iterations: MAX_ITERATIONS,
  };
}
