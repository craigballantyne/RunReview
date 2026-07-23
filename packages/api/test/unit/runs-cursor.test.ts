import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "../../src/modules/runs/runs.service.js";
import { ValidationError } from "../../src/lib/errors.js";

describe("cursor encode/decode", () => {
  it("round-trips a cursor", () => {
    const cursor = { startTimeGmt: "2022-01-01T00:00:00.000Z", id: "abc-123" };
    const encoded = encodeCursor(cursor);
    expect(decodeCursor(encoded)).toEqual(cursor);
  });

  it("throws a ValidationError for a garbage cursor", () => {
    expect(() => decodeCursor("not-a-valid-cursor!!")).toThrow(ValidationError);
  });

  it("throws a ValidationError for a well-formed base64url payload missing expected fields", () => {
    const encoded = Buffer.from(JSON.stringify({ foo: "bar" })).toString("base64url");
    expect(() => decodeCursor(encoded)).toThrow(ValidationError);
  });
});
