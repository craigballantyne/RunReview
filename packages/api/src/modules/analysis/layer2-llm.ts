import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import type { Layer2Tags, ParsedIntent, SegmentClassification } from "@run-review/shared";

/**
 * Bumped whenever the prompt or output schema changes in a way that would produce different
 * output for the same run, so stored insights can be re-analysed selectively.
 */
export const LAYER2_VERSION = 1;

/**
 * Sonnet-tier is the right fit: this call reads one short free-text title. It never sees the raw
 * track and never touches the computed tags.
 */
const MODEL = "claude-sonnet-5";

/**
 * Low effort suits a scoped extraction task. Adaptive thinking is left on so the model can spend a
 * little more where a title is genuinely ambiguous, without paying for it on the many runs whose
 * title is just a place name.
 */
const EFFORT = "low";

const MAX_TOKENS = 4096;

const PLANNED_STRUCTURE = ["easy", "steady", "intervals", "progression", "fartlek", "mixed", "unclear"] as const;
const PLANNED_INTENSITY = ["easy", "moderate", "hard", "unclear"] as const;

/**
 * Intent only. There is deliberately no channel here for changing a computed tag.
 *
 * An earlier version let the title override `workoutStructure` and the observational flags, on the
 * reasoning that a planned negative split isn't really a fade. That was wrong: the tags describe
 * what the run *was*, and a title describes what it was meant to be. Setting out to run easy and
 * failing to keep it easy doesn't make the run easy — it makes it a run that drifted into
 * something harder, and that gap is precisely what Layer 3's `execution_vs_intent` exists to
 * report. Overriding the tag would delete the very discrepancy worth surfacing.
 */
export const LAYER2_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent"],
  properties: {
    intent: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["statedWorkout", "plannedStructure", "plannedIntensity", "planWeek", "isRace"],
          properties: {
            statedWorkout: {
              anyOf: [{ type: "string" }, { type: "null" }],
              description:
                "The workout as the title describes it, in a short normalised phrase. Null if the title names no workout.",
            },
            plannedStructure: {
              anyOf: [{ type: "string", enum: PLANNED_STRUCTURE }, { type: "null" }],
              description:
                "The shape the title says was planned. This is the intention, not what happened — never adjust it toward what the data shows.",
            },
            plannedIntensity: {
              anyOf: [{ type: "string", enum: PLANNED_INTENSITY }, { type: "null" }],
              description: "The effort level the title says was planned.",
            },
            planWeek: {
              anyOf: [{ type: "integer" }, { type: "null" }],
              description: "Training-plan week where the title encodes one, e.g. 'W3 Fri Tempo' is 3.",
            },
            isRace: {
              type: "boolean",
              description: "True only when the title names an actual race or event, not a hard training effort.",
            },
          },
        },
        { type: "null" },
      ],
      description: "Parsed from the activity title alone. Null when the title carries no workout.",
    },
  },
} as const;

export interface Layer2LlmOutput {
  intent: ParsedIntent | null;
}

const SYSTEM_PROMPT = `You extract the intended workout from a running activity's title.

You are shown tags that were already computed from the run's data. They are there only so you can tell how specific the title is being; they are correct, and you must not comment on them, second-guess them, or let them influence what you extract.

**Extract only what the title states.**

Titles are inconsistent. Many are just a place name ("City of Edinburgh Running") and describe no workout at all — return null intent for those. Some encode a training plan ("W3 Fri Tempo - Rolling 300s (8.9k)" means plan week 3, a tempo session of rolling 300m repetitions). Some are hand-edited or vague.

Never infer intent from the run's statistics, from the location, or from what the numbers suggest the session probably was. A title that says nothing means intent is unknown, and unknown is a useful, correct answer. Guessing destroys the signal.

**Report the plan, not the outcome.**

This is the part that matters most. If the title says "Easy 10k" and the computed tags show a hard steady effort, the planned intensity is still "easy" — you are recording what was set out to be done. Do not reconcile the two, soften the intent toward what happened, or decide the athlete must have meant something else. A downstream step compares your answer against what actually happened and reports the gap; if you close that gap here, it has nothing to work with.

The same applies to \`isRace\`: set it true only when the title names an actual event. A hard solo effort described as a time trial is not a race.`;

export interface Layer2LlmInput {
  activityName: string;
  distanceM: number;
  movingDurationSec: number;
  computedTags: Layer2Tags;
  segments: SegmentClassification[];
}

/**
 * Compact per-segment view. Rounded because sub-second precision is noise here and costs tokens on
 * every segment of every run.
 */
function summariseSegments(segments: SegmentClassification[]) {
  return segments.map((s) => ({
    lap: s.splitIndex,
    role: s.role,
    km: Math.round(s.distanceM) / 1000,
    paceSecPerKm: Math.round(s.paceSecPerKm),
    hr: s.avgHr,
  }));
}

function buildUserContent(input: Layer2LlmInput): string {
  return JSON.stringify({
    activityTitle: input.activityName,
    distanceKm: Math.round(input.distanceM) / 1000,
    movingDurationSec: Math.round(input.movingDurationSec),
    // Context for judging how specific the title is — not an input to the extraction.
    observedTags: {
      workoutStructure: input.computedTags.workoutStructure,
      warmupCooldownDetected: input.computedTags.warmupCooldownDetected,
    },
    segments: summariseSegments(input.segments),
  });
}

export class MissingAnthropicKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not configured, so LLM analysis cannot run");
    this.name = "MissingAnthropicKeyError";
  }
}

export interface Layer2LlmClient {
  parseIntent: (input: Layer2LlmInput) => Promise<Layer2LlmOutput>;
}

/**
 * Wraps the single Layer 2 model call.
 *
 * No prompt caching: the system prompt sits below Sonnet's 1024-token minimum cacheable prefix, so
 * a `cache_control` breakpoint would silently do nothing. Layer 3's prompt is substantially larger
 * and is where caching will actually pay.
 */
export function createLayer2LlmClient(apiKey: string | undefined): Layer2LlmClient {
  if (!apiKey) {
    return {
      parseIntent: () => {
        throw new MissingAnthropicKeyError();
      },
    };
  }

  const client = new Anthropic({ apiKey });

  return {
    async parseIntent(input) {
      const response = await client.messages.parse({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        thinking: { type: "adaptive" },
        output_config: { effort: EFFORT, format: jsonSchemaOutputFormat(LAYER2_OUTPUT_SCHEMA) },
        messages: [{ role: "user", content: buildUserContent(input) }],
      });

      // Safety classifiers can decline with a 200 and an empty body, so `stop_reason` has to be
      // checked before reading anything out of the response.
      if (response.stop_reason === "refusal") {
        throw new Error(`Layer 2 intent parsing refused: ${response.stop_details?.explanation ?? "no explanation given"}`);
      }
      if (!response.parsed_output) {
        throw new Error(`Layer 2 intent parsing returned no parsable output (stop_reason: ${response.stop_reason})`);
      }

      return response.parsed_output as Layer2LlmOutput;
    },
  };
}
