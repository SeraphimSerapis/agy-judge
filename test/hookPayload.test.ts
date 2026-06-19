import { describe, expect, it } from "vitest";
import { parseStopHookInput, stopHookInputSchema, tryParseStopHookInput } from "../src/hookPayload.js";

const validPayload = {
  executionNum: 0,
  terminationReason: "NO_TOOL_CALL",
  error: "",
  fullyIdle: true,
  conversationId: "abc-123",
  workspacePaths: ["/path/to/workspace"],
  transcriptPath: "/path/to/transcript",
  artifactDirectoryPath: "/path/to/artifacts",
};

describe("stopHookInputSchema", () => {
  it("parses a well-formed Stop payload", () => {
    const result = stopHookInputSchema.parse(validPayload);
    expect(result).toEqual(validPayload);
  });

  it("accepts a payload with all fields omitted", () => {
    const result = stopHookInputSchema.parse({});
    expect(result).toEqual({});
  });

  it("accepts unknown fields via passthrough", () => {
    const result = stopHookInputSchema.parse({ ...validPayload, futureField: "ok" });
    expect(result.futureField).toBe("ok");
  });

  it("rejects executionNum with a non-integer or negative value", () => {
    expect(() => stopHookInputSchema.parse({ executionNum: -1 })).toThrow();
    expect(() => stopHookInputSchema.parse({ executionNum: 1.5 })).toThrow();
  });

  it("rejects fullyIdle with a non-boolean value", () => {
    expect(() => stopHookInputSchema.parse({ fullyIdle: "yes" })).toThrow();
  });

  it("rejects workspacePaths with a non-array value", () => {
    expect(() => stopHookInputSchema.parse({ workspacePaths: "/not/an/array" })).toThrow();
  });
});

describe("parseStopHookInput", () => {
  it("parses valid JSON against the schema", () => {
    const result = parseStopHookInput(JSON.stringify(validPayload));
    expect(result.conversationId).toBe("abc-123");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseStopHookInput("not json")).toThrow();
  });

  it("throws on valid JSON that fails the schema", () => {
    expect(() => parseStopHookInput(JSON.stringify({ executionNum: -5 }))).toThrow();
  });
});

describe("tryParseStopHookInput", () => {
  it("returns ok on success", () => {
    const result = tryParseStopHookInput(JSON.stringify(validPayload));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.workspacePaths?.[0]).toBe("/path/to/workspace");
    }
  });

  it("returns error on invalid JSON", () => {
    const result = tryParseStopHookInput("not json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });

  it("returns error on schema violation", () => {
    const result = tryParseStopHookInput(JSON.stringify({ executionNum: -1 }));
    expect(result.ok).toBe(false);
  });
});
