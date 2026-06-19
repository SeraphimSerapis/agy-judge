import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendHookLogEvent, clearHookLog, readHookLogEvents } from "../src/hookLog.js";

describe("hookLog", () => {
  it("appends and reads hook events", () => {
    const path = join(mkdtempSync(join(tmpdir(), "agy-judge-hook-log-")), "events.ndjson");

    appendHookLogEvent(path, {
      event: "received",
      conversationId: "conv",
      executionNum: 1,
      workspace: "/workspace",
    });
    appendHookLogEvent(path, {
      event: "skip",
      reason: "duplicate",
      conversationId: "conv",
      executionNum: 2,
      workspace: "/workspace",
    });

    const events = readHookLogEvents(path);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ event: "received", conversationId: "conv" });
    expect(events[1]).toMatchObject({ event: "skip", reason: "duplicate" });
    expect(events[0].timestamp).toBeTruthy();
  });

  it("limits returned events to the newest entries", () => {
    const path = join(mkdtempSync(join(tmpdir(), "agy-judge-hook-log-")), "events.ndjson");

    appendHookLogEvent(path, { event: "skip", reason: "first" });
    appendHookLogEvent(path, { event: "skip", reason: "second" });
    appendHookLogEvent(path, { event: "skip", reason: "third" });

    const events = readHookLogEvents(path, 2);

    expect(events.map((event) => event.reason)).toEqual(["second", "third"]);
  });

  it("clears the log file", () => {
    const path = join(mkdtempSync(join(tmpdir(), "agy-judge-hook-log-")), "events.ndjson");

    appendHookLogEvent(path, { event: "skip", reason: "before" });
    clearHookLog(path);

    expect(readHookLogEvents(path)).toEqual([]);
  });
});
