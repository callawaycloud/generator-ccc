import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import path from "node:path";
import { EOL } from "node:os";
import { mergeJsonFile, previewJsonMerge, type JsonObject } from "./json-merge.js";

export type FileWriteResult = "created" | "merged" | "skipped";

export interface CopyStaticOptions {
  templateDir: string;
  destRoot: string;
  defaultBranch: string;
  overwriteStatic?: boolean;
}

export interface ScaffoldSummary {
  created: string[];
  merged: string[];
  skipped: string[];
}

/**
 * Creates an empty scaffold summary tracker.
 */
export function createScaffoldSummary(): ScaffoldSummary {
  return { created: [], merged: [], skipped: [] };
}

/**
 * Records a file write result into the scaffold summary.
 */
export function recordResult(
  summary: ScaffoldSummary,
  relativePath: string,
  result: FileWriteResult
): void {
  if (result === "created") {
    summary.created.push(relativePath);
  } else if (result === "merged") {
    summary.merged.push(relativePath);
  } else {
    summary.skipped.push(relativePath);
  }
}

/**
 * Returns true when the file path represents a JSON config file.
 */
function isJsonFile(filePath: string): boolean {
  const base = path.basename(filePath);
  if (base === ".prettierrc") {
    return true;
  }
  return base.endsWith(".json");
}

/**
 * Replaces {{defaultBranch}} placeholders in file content.
 */
export function applyTemplatePlaceholders(content: string, defaultBranch: string): string {
  if (!content.includes("{{defaultBranch}}")) {
    return content;
  }
  return content.replaceAll("{{defaultBranch}}", defaultBranch);
}

/**
 * Recursively copies static template files to the destination.
 * Existing non-JSON files are skipped; JSON files are deep-merged.
 */
export function copyStaticTemplates(options: CopyStaticOptions): ScaffoldSummary {
  const summary = createScaffoldSummary();
  copyDirectoryRecursive(options.templateDir, options.destRoot, options, summary, "");
  return summary;
}

/**
 * Recursively walks the template directory and copies or merges files.
 */
function copyDirectoryRecursive(
  templateDir: string,
  destRoot: string,
  options: CopyStaticOptions,
  summary: ScaffoldSummary,
  relativeDir: string
): void {
  if (!existsSync(templateDir)) {
    return;
  }

  const entries = readdirSync(templateDir);
  for (const entry of entries) {
    const templatePath = path.join(templateDir, entry);
    const relativePath = path.join(relativeDir, entry);
    const destPath = path.join(destRoot, relativePath);

    const stat = statSync(templatePath);
    if (stat.isDirectory()) {
      if (!existsSync(destPath)) {
        mkdirSync(destPath, { recursive: true });
      }
      copyDirectoryRecursive(templatePath, destRoot, options, summary, relativePath);
      continue;
    }

    const destExists = existsSync(destPath);

    if (isJsonFile(templatePath)) {
      const templateContent = readFileSync(templatePath, "utf-8");
      const templated = applyTemplatePlaceholders(templateContent, options.defaultBranch);
      let defaultJson: JsonObject;
      try {
        defaultJson = JSON.parse(templated) as JsonObject;
      } catch (error) {
        throw new Error(`Failed to parse JSON template ${relativePath}: ${String(error)}`, {
          cause: error,
        });
      }
      const result = mergeJsonFile(destPath, defaultJson);
      recordResult(summary, relativePath, result);
      continue;
    }

    if (destExists) {
      if (options.overwriteStatic) {
        let content = readFileSync(templatePath, "utf-8");
        content = applyTemplatePlaceholders(content, options.defaultBranch);
        const result = writeTextFile(
          destPath,
          content,
          relativePath.endsWith(".sh") ? { mode: 0o755 } : undefined
        );
        recordResult(summary, relativePath, result);
        continue;
      }

      recordResult(summary, relativePath, "skipped");
      continue;
    }

    const parentDir = path.dirname(destPath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    let content = readFileSync(templatePath, "utf-8");
    content = applyTemplatePlaceholders(content, options.defaultBranch);
    writeFileSync(destPath, content, "utf-8");

    if (relativePath.endsWith(".sh")) {
      chmodSync(destPath, 0o755);
    }

    recordResult(summary, relativePath, "created");
  }
}

/**
 * Appends missing default entries to .gitignore.
 */
export function appendGitignore(destRoot: string, entries: readonly string[]): FileWriteResult {
  const ignorePath = path.join(destRoot, ".gitignore");
  const fileExisted = existsSync(ignorePath);
  const currentIgnore = fileExisted ? readFileSync(ignorePath, "utf-8") : "";
  const currentIgnoreLines = currentIgnore.split(EOL);
  const missing: string[] = [];

  for (const entry of entries) {
    if (!currentIgnoreLines.includes(entry)) {
      missing.push(entry);
    }
  }

  if (missing.length === 0) {
    return fileExisted ? "skipped" : "created";
  }

  const separator = currentIgnore.length > 0 && !currentIgnore.endsWith(EOL) ? EOL : "";
  const newContent = currentIgnore + separator + missing.join(EOL) + EOL;
  writeFileSync(ignorePath, newContent, "utf-8");
  return fileExisted ? "merged" : "created";
}

/**
 * Returns true when gitignore would change if entries were appended.
 */
export function previewGitignoreChange(destRoot: string, entries: readonly string[]): boolean {
  const ignorePath = path.join(destRoot, ".gitignore");
  const currentIgnore = existsSync(ignorePath) ? readFileSync(ignorePath, "utf-8") : "";
  const currentIgnoreLines = currentIgnore.split(EOL);

  for (const entry of entries) {
    if (!currentIgnoreLines.includes(entry)) {
      return true;
    }
  }

  return false;
}

/**
 * Writes a text file, creating parent directories as needed.
 */
export function writeTextFile(
  filePath: string,
  content: string,
  options?: { mode?: number }
): FileWriteResult {
  const fileExists = existsSync(filePath);
  if (fileExists) {
    const existing = readFileSync(filePath, "utf-8");
    if (existing === content) {
      return "skipped";
    }
  }

  const parentDir = path.dirname(filePath);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  writeFileSync(filePath, content, "utf-8");
  if (options?.mode !== undefined) {
    chmodSync(filePath, options.mode);
  }

  return fileExists ? "merged" : "created";
}

/**
 * Returns true when writing the given content would change the file.
 */
export function previewTextFileChange(filePath: string, content: string): boolean {
  if (!existsSync(filePath)) {
    return true;
  }
  return readFileSync(filePath, "utf-8") !== content;
}

/**
 * Returns relative paths of static template files that would change during copy.
 */
export function previewStaticTemplateChanges(options: CopyStaticOptions): string[] {
  const changes: string[] = [];
  collectStaticChanges(options.templateDir, options.destRoot, options, "", changes);
  return changes;
}

/**
 * Recursively collects paths that would be created, merged, or changed.
 */
function collectStaticChanges(
  templateDir: string,
  destRoot: string,
  options: CopyStaticOptions,
  relativeDir: string,
  changes: string[]
): void {
  if (!existsSync(templateDir)) {
    return;
  }

  const entries = readdirSync(templateDir);
  for (const entry of entries) {
    const templatePath = path.join(templateDir, entry);
    const relativePath = path.join(relativeDir, entry);
    const destPath = path.join(destRoot, relativePath);

    const stat = statSync(templatePath);
    if (stat.isDirectory()) {
      collectStaticChanges(templatePath, destRoot, options, relativePath, changes);
      continue;
    }

    if (isJsonFile(templatePath)) {
      const templateContent = readFileSync(templatePath, "utf-8");
      const templated = applyTemplatePlaceholders(templateContent, options.defaultBranch);
      let defaultJson: JsonObject;
      try {
        defaultJson = JSON.parse(templated) as JsonObject;
      } catch {
        continue;
      }
      if (previewJsonMerge(destPath, defaultJson) !== null) {
        changes.push(relativePath);
      }
      continue;
    }

    if (!existsSync(destPath)) {
      changes.push(relativePath);
      continue;
    }

    if (!options.overwriteStatic) {
      continue;
    }

    const templateContent = applyTemplatePlaceholders(
      readFileSync(templatePath, "utf-8"),
      options.defaultBranch
    );
    if (previewTextFileChange(destPath, templateContent)) {
      changes.push(relativePath);
    }
  }
}

/**
 * Merges a JSON defaults file and records the result in the summary.
 */
export function mergeJsonDefaultsFile(
  summary: ScaffoldSummary,
  filePath: string,
  relativePath: string,
  defaults: JsonObject
): void {
  const result = mergeJsonFile(filePath, defaults);
  recordResult(summary, relativePath, result);
}

/**
 * Returns true when a JSON defaults merge would change the file.
 */
export function previewJsonDefaultsChange(filePath: string, defaults: JsonObject): boolean {
  return previewJsonMerge(filePath, defaults) !== null;
}
