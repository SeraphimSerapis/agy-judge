import type { JudgeConfig, Severity } from "./config.js";
import type { JudgeResponse } from "./schema.js";

export interface PolicyDecision {
  blocked: boolean;
  exitCode: 0 | 1;
  reason: string;
}

export function applyPolicy(judge: JudgeResponse, config: Pick<JudgeConfig, "mode" | "blockOn">): PolicyDecision {
  if (config.mode === "advisory") {
    return {
      blocked: false,
      exitCode: 0,
      reason: judge.should_block ? "Judge recommended blocking, but advisory mode never blocks." : "Advisory mode."
    };
  }

  if (config.mode === "warn") {
    return {
      blocked: false,
      exitCode: 0,
      reason: "Warn mode reports issues without blocking."
    };
  }

  const matchedSeverity = highestMatchingSeverity(judge, config.blockOn);
  const blocks = Boolean(matchedSeverity) || (judge.should_block && hasSeverityInBlockSet(judge, config.blockOn));
  return {
    blocked: blocks,
    exitCode: blocks ? 1 : 0,
    reason: blocks
      ? `Block mode matched severity: ${matchedSeverity ?? config.blockOn.join(",")}.`
      : "Block mode found no issue at a configured blocking severity."
  };
}

function highestMatchingSeverity(judge: JudgeResponse, blockOn: Severity[]): Severity | undefined {
  const order: Severity[] = ["critical", "high", "medium", "low"];
  return order.find((severity) => blockOn.includes(severity) && judge.issues.some((issue) => issue.severity === severity));
}

function hasSeverityInBlockSet(judge: JudgeResponse, blockOn: Severity[]): boolean {
  return judge.issues.some((issue) => blockOn.includes(issue.severity));
}
