import { readFile } from "node:fs/promises";

function stripParamTypesInDeclarations(source) {
  const lines = source.split("\n");
  let inParams = false;

  return lines
    .map((line) => {
      const startsDeclaration =
        /\bfunction\b.*\(/.test(line) ||
        /\bconstructor\s*\(/.test(line) ||
        (/^\s*(async\s+)?[A-Za-z_$][\w$]*\s*\(/.test(line) && line.includes(":"));

      if (startsDeclaration) {
        inParams = true;
      }

      const nextLine = inParams
        ? line.replace(/([,(]\s*[A-Za-z_$][\w$]*)\??\s*:\s*[^,)=]+/g, "$1")
            .replace(/^(\s*[A-Za-z_$][\w$]*)\??\s*:\s*[^,)=]+/g, "$1")
        : line;

      if (inParams && /\)\s*(?::\s*[^{=]+)?\s*\{/.test(line)) {
        inParams = false;
      }

      return nextLine;
    })
    .join("\n");
}

function stripTypes(source) {
  const withoutTypeBlocks = source
    .replace(/^\s*import\s+type\s+\{[\s\S]*?\}\s+from\s+["'][^"']+["'];\s*$/gm, "")
    .replace(/^\s*import\s+type\s+[^;]+;\s*$/gm, "")
    .replace(/^\s*export\s+type\s+[^;]+;\s*$/gm, "")
    .replace(/^\s*export\s+interface\s+\w+\s*\{[\s\S]*?^\}\s*$/gm, "")
    .replace(/^\s*interface\s+\w+\s*\{[\s\S]*?^\}\s*$/gm, "")
    .replace(/\b(private|public|protected|readonly)\s+/g, "")
    .replace(/^(\s*[A-Za-z_$][\w$]*)\s*:\s*[^;=\n]+;/gm, "$1;")
    .replace(/\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*:\s*[^=;\n]+(?=\s*=)/g, "$1 $2")
    .replace(/\)\s*:\s*[^{}\n=]+(?=\s*\{)/g, ")")
    .replace(/\s+as\s+const\b/g, "");

  return stripParamTypesInDeclarations(withoutTypeBlocks);
}

export async function load(url, context, defaultLoad) {
  if (!url.endsWith(".ts")) {
    return defaultLoad(url, context, defaultLoad);
  }

  const source = await readFile(new URL(url), "utf8");
  return {
    format: "module",
    shortCircuit: true,
    source: stripTypes(source),
  };
}