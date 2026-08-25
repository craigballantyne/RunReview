import { describe, expect, it } from "vitest";
import {
  createLayer2LlmClient,
  LAYER2_OUTPUT_SCHEMA,
  MissingAnthropicKeyError,
} from "../../src/modules/analysis/layer2-llm.js";

describe("createLayer2LlmClient", () => {
  it("fails with a clear error when no API key is configured", async () => {
    // The key is optional in the env schema, so an unset key must fail the job — not the boot.
    const client = createLayer2LlmClient(undefined);
    await expect(async () => client.parseIntent({} as never)).rejects.toThrow(MissingAnthropicKeyError);
  });
});

describe("LAYER2_OUTPUT_SCHEMA", () => {
  it("exposes intent and nothing else", () => {
    // The model's entire remit is reading the title. Anything else here would be a way for it to
    // reach a tag it cannot verify.
    expect(Object.keys(LAYER2_OUTPUT_SCHEMA.properties)).toEqual(["intent"]);
  });

  it("offers no channel for overriding a computed tag", () => {
    // Regression guard on a design decision rather than on behaviour: an earlier version let the
    // title overturn workoutStructure and the observational flags. That deleted the very
    // intent-versus-outcome discrepancy Layer 3 exists to report.
    const serialised = JSON.stringify(LAYER2_OUTPUT_SCHEMA);
    expect(serialised).not.toMatch(/[Oo]verride/);
    expect(serialised).not.toMatch(/fadeDetected|surgePattern|effortPaceMismatch|evenEffortDespiteTerrain/);
  });

  it("marks every property required, as structured outputs demands", () => {
    const intent = LAYER2_OUTPUT_SCHEMA.properties.intent.anyOf[0];
    expect([...LAYER2_OUTPUT_SCHEMA.required]).toEqual(Object.keys(LAYER2_OUTPUT_SCHEMA.properties));
    expect([...intent.required].sort()).toEqual(Object.keys(intent.properties).sort());
  });

  it("forbids additional properties on every object in the schema", () => {
    const objects: Record<string, unknown>[] = [];
    const walk = (node: unknown) => {
      if (typeof node !== "object" || node === null) return;
      const record = node as Record<string, unknown>;
      if (record.type === "object") objects.push(record);
      for (const value of Object.values(record)) {
        if (Array.isArray(value)) value.forEach(walk);
        else walk(value);
      }
    };
    walk(LAYER2_OUTPUT_SCHEMA);

    expect(objects.length).toBe(2);
    for (const obj of objects) expect(obj.additionalProperties).toBe(false);
  });

  it("lets intent itself be null, so an uninformative title stays uninformative", () => {
    // Most titles are just a place name. Forcing a guess there would poison Layer 3's comparison.
    expect(LAYER2_OUTPUT_SCHEMA.properties.intent.anyOf.some((b) => (b as { type?: string }).type === "null")).toBe(true);
  });

  it("keeps planned structure on the same vocabulary as observed structure", () => {
    // Layer 3 compares the two directly, so a drift between the enums would break that comparison.
    const plannedStructure = LAYER2_OUTPUT_SCHEMA.properties.intent.anyOf[0].properties.plannedStructure;
    const enumBranch = plannedStructure.anyOf.find((b) => "enum" in b) as { enum: readonly string[] };

    expect([...enumBranch.enum].sort()).toEqual(
      ["easy", "steady", "intervals", "progression", "fartlek", "mixed", "unclear"].sort(),
    );
  });

  it("does not treat race as a structure", () => {
    // A race can be run as a steady effort or as a progression; those are the shapes worth
    // recording. Race-ness is context, and lives on the intent object.
    const plannedStructure = LAYER2_OUTPUT_SCHEMA.properties.intent.anyOf[0].properties.plannedStructure;
    const enumBranch = plannedStructure.anyOf.find((b) => "enum" in b) as { enum: readonly string[] };

    expect(enumBranch.enum).not.toContain("race");
    expect(LAYER2_OUTPUT_SCHEMA.properties.intent.anyOf[0].properties.isRace.type).toBe("boolean");
  });
});
