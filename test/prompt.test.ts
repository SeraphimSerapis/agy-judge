import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/prompt.js";

describe("buildSystemPrompt", () => {
  it("includes the selected profile instructions", () => {
    const prompt = buildSystemPrompt("security");

    expect(prompt).toContain("Active review profile: security");
    expect(prompt).toContain("Emphasize security");
  });

  it("includes an optional trusted rubric", () => {
    const prompt = buildSystemPrompt("release", "Check installability.");

    expect(prompt).toContain("Additional trusted user rubric");
    expect(prompt).toContain("Check installability.");
  });
});
