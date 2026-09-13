import { readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTENT_FILES,
  type ContentIssue,
  type ContentSource,
  type ContentSources,
  ContentValidationError,
  loadWorld,
  type World,
} from "../content";

export const DEFAULT_CONTENT_DIR = fileURLToPath(new URL("../../content", import.meta.url));

function displayPath(fullPath: string): string {
  const rel = relative(process.cwd(), fullPath);
  return rel.startsWith("..") || isAbsolute(rel) ? fullPath : rel;
}

/** Node host: reads the content YAML files from disk and validates them. */
export function loadWorldFromDisk(dir: string = DEFAULT_CONTENT_DIR): World {
  const issues: ContentIssue[] = [];
  const read = (file: string): ContentSource => {
    const fullPath = join(dir, file);
    const path = displayPath(fullPath);
    try {
      return { path, text: readFileSync(fullPath, "utf8") };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      issues.push({ file: path, field: "(file)", message: `could not be read: ${reason}` });
      return { path, text: "" };
    }
  };

  const sources = Object.fromEntries(
    Object.entries(CONTENT_FILES).map(([key, file]) => [key, read(file)]),
  ) as ContentSources;
  if (issues.length > 0) throw new ContentValidationError(issues);
  return loadWorld(sources);
}
