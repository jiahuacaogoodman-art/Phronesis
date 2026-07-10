import type { ClassifiedConversationIntent } from "../types/conversation-runtime.js";

function extractQuoted(text: string): string | undefined {
  const match = text.match(/["“](.+?)["”]/);
  return match ? match[1] : undefined;
}

function extractGoal(text: string): string | undefined {
  const quoted = extractQuoted(text);
  if (quoted) return quoted;
  const match = text.match(/(?:做|设计|实现|规划|开发|构建|我要做|帮我做)(一个|一套)?(.+?)(?:$|，|。|；|;)/);
  if (!match) return undefined;
  const goal = `${match[1] ?? ""}${match[2] ?? ""}`.trim();
  return goal || undefined;
}

function extractPathAfter(text: string, label: string): string | undefined {
  const index = text.indexOf(label);
  if (index < 0) return undefined;
  const token = text.slice(index + label.length).trim().split(/\s+/)[0];
  return token || undefined;
}

export function classifyConversationIntent(message: unknown): ClassifiedConversationIntent {
  const text = String(message ?? "").trim();
  const lower = text.toLowerCase();
  const targetRepo = extractPathAfter(text, "--target-repo") ?? extractPathAfter(text, "target repo") ?? extractPathAfter(text, "仓库");
  const runRef = extractPathAfter(text, "--run");

  if (!text) {
    return {
      intent: "ask_clarifying_question",
      confidence: 0.9,
      riskLevel: "low",
      requiresConfirmation: false,
      reason: "Empty message needs clarification.",
    };
  }

  if (/为什么.*(blocked|阻塞|不能|卡住)/i.test(text) || /(blocked|阻塞).*(原因|为什么)/i.test(text)) {
    return {
      intent: "explain_blockers",
      confidence: 0.92,
      runRef,
      riskLevel: "low",
      requiresConfirmation: false,
      reason: "User asks why the latest planning state is blocked.",
    };
  }

  if (/toy\s*eval/i.test(text) || /玩具.*eval|跑一次.*eval|跑.*toy/i.test(text)) {
    return {
      intent: "run_autocode_eval",
      confidence: 0.9,
      requestedMode: /dry|dry-run|演练/i.test(text) ? "dry-run" : "execute",
      riskLevel: /execute|执行/i.test(text) ? "high" : "medium",
      requiresConfirmation: /execute|执行/i.test(text),
      reason: "User requests the local native autocode evaluation harness.",
    };
  }

  if (/dry-run|dry run|演练|试跑/.test(lower) || /对这个.*repo.*dry/i.test(text)) {
    return {
      intent: "run_autocode_dry_run",
      confidence: 0.82,
      targetRepo,
      runRef,
      requestedMode: "dry-run",
      riskLevel: "medium",
      requiresConfirmation: false,
      reason: "User requests a non-applying autocode run.",
    };
  }

  if (/autocode.*execute|执行.*autocode|真正.*改|apply patch|执行 coding|开始 coding/i.test(text)) {
    return {
      intent: "run_autocode_execute",
      confidence: 0.86,
      targetRepo,
      runRef,
      requestedMode: "execute",
      riskLevel: "high",
      requiresConfirmation: true,
      reason: "User requests a side-effecting native coding execution.",
    };
  }

  if (/handoff|交接|生成.*coding/i.test(text)) {
    return {
      intent: "generate_handoff",
      confidence: 0.84,
      runRef,
      riskLevel: "low",
      requiresConfirmation: false,
      reason: "User asks to generate or inspect a coding handoff.",
    };
  }

  if (/总结|解释.*生成|生成了什么|最新\s*run|latest run|看看结果/i.test(text)) {
    return {
      intent: /最新\s*run|latest run/i.test(text) ? "inspect_latest_run" : "summarize_artifacts",
      confidence: 0.82,
      runRef,
      riskLevel: "low",
      requiresConfirmation: false,
      reason: "User asks for a conversational artifact summary.",
    };
  }

  if (/继续|继续推进|继续研究|补充研究|联网研究/i.test(text)) {
    return {
      intent: "continue_research",
      confidence: 0.72,
      runRef,
      riskLevel: "medium",
      requiresConfirmation: false,
      reason: "User asks to continue the planning or research flow.",
    };
  }

  if (/失败.*继续|根据失败|修复失败|repair/i.test(text)) {
    return {
      intent: "repair_from_failure",
      confidence: 0.78,
      runRef,
      riskLevel: "high",
      requiresConfirmation: true,
      reason: "User asks to continue from a coding failure.",
    };
  }

  const goal = extractGoal(text);
  if (goal) {
    return {
      intent: "create_planning_run",
      confidence: 0.88,
      extractedGoal: goal,
      requestedMode: /rule/i.test(text) ? "rule" : "hybrid",
      riskLevel: "medium",
      requiresConfirmation: false,
      reason: "User provided a software goal that should start a planning run.",
    };
  }

  return {
    intent: "unknown",
    confidence: 0.35,
    riskLevel: "low",
    requiresConfirmation: false,
    reason: "No known conversation runtime intent matched.",
  };
}