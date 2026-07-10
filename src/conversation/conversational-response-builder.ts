import type { ArtifactConversationSummary, PendingConfirmation } from "../types/conversation-runtime.js";

interface ConversationalResponseInput {
  summary: ArtifactConversationSummary;
  pendingConfirmation?: PendingConfirmation;
  reason?: string;
}

function linesFor(title: string, items: string[] | undefined): string[] {
  const list = (items ?? []).filter(Boolean);
  if (list.length === 0) return [`${title}: none`];
  return [`${title}:`, ...list.map((item) => `- ${item}`)];
}

export function buildConversationalResponse(input: ConversationalResponseInput): string {
  const summary = input.summary ?? {};
  const confirmation = input.pendingConfirmation;
  const parts = [
    "当前状态",
    summary.currentStatus ?? "No runtime state is available yet.",
    "",
    "关键结论",
    ...(summary.importantFindings?.length ? summary.importantFindings.map((item) => `- ${item}`) : ["- No important findings yet."]),
    "",
    ...linesFor("为什么", summary.blockers?.length ? summary.blockers : [input.reason ?? "No blocker was found."]),
    "",
    ...linesFor("下一步可执行动作", summary.recommendedNextActions),
  ];

  if (confirmation) {
    parts.push("");
    parts.push("需要确认");
    parts.push(`- Confirmation ID: ${confirmation.confirmationId}`);
    parts.push(`- ${confirmation.reason}`);
    parts.push("- Run `pnpm think:chat --confirm <confirmationId>` only after you really want to execute this side-effecting action.");
  }

  if (summary.artifactPaths?.length) {
    parts.push("");
    parts.push("相关 artifact");
    for (const filePath of summary.artifactPaths.slice(0, 8)) {
      parts.push(`- ${filePath}`);
    }
  }

  return parts.join("\n");
}