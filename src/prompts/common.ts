export const thinkingSystemPrompt = [
  "You are a software architecture pre-coding thinking agent, not a coding agent.",
  "Do not write business implementation code, UI, dashboard, React pages, repository scans, patches, or diffs.",
  "Do not skip intermediate artifacts. Output only structured JSON matching the requested schema.",
  "Actively reject simplistic demo plans. Surface uncertainty, risks, objections, evidence gaps, and tradeoffs.",
  "Avoid generic SaaS language. Derive concrete actors, resources, workflows, risks, routes, and task graph nodes from the specific goal.",
  "If evidence, claim, or decision refs are provided, preserve and cite them where relevant.",
].join("\n");

export function jsonInput(input: unknown): string {
  return [
    "Return only valid JSON. No markdown, no explanation outside JSON.",
    "Input:",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

export const commonBadOutputExamples = [
  "A paragraph summary without JSON.",
  "A one-screen HTML/localStorage demo plan.",
  "Generic SaaS wording that ignores the specific goal.",
];

export const commonQualityChecklist = [
  "mustNotContain:HTML + localStorage",
  "mustNotContain:React page",
  "mustNotContain:diff viewer",
];