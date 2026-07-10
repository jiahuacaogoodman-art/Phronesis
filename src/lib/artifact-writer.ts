import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export class ArtifactWriter {
  private readonly runDir: string;

  constructor(runDir: string) {
    this.runDir = runDir;
  }

  async ensureRunDir(): Promise<void> {
    await mkdir(this.runDir, { recursive: true });
  }

  async writeJson(fileName: string, value: unknown): Promise<void> {
    await writeFile(
      path.join(this.runDir, fileName),
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8",
    );
  }

  async writeMarkdown(fileName: string, markdown: string): Promise<void> {
    await writeFile(path.join(this.runDir, fileName), `${markdown.trim()}\n`, "utf8");
  }
}