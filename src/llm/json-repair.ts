export function extractJsonText(rawText: unknown): string {
  const text = String(rawText ?? "").trim();
  if (!text) return "";

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }

  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");

  if (arrayStart >= 0 && arrayEnd > arrayStart && (objectStart < 0 || arrayStart < objectStart)) {
    return text.slice(arrayStart, arrayEnd + 1).trim();
  }
  if (objectStart >= 0 && objectEnd > objectStart) {
    return text.slice(objectStart, objectEnd + 1).trim();
  }
  return text;
}

export function tryRepairJsonText(rawText: unknown): { text: string; repaired: boolean } {
  const extracted = extractJsonText(rawText);
  return {
    text: extracted,
    repaired: extracted !== String(rawText ?? "").trim(),
  };
}