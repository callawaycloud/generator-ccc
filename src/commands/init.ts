import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as p from "@clack/prompts";
import {
  createProjectContext,
  detectDefaultBranch,
  type ProjectContext,
} from "../lib/context.js";
import {
  appendGitignore,
  copyStaticTemplates,
  createScaffoldSummary,
  mergeJsonDefaultsFile,
  recordResult,
  writeTextFile,
  type ScaffoldSummary,
} from "../lib/files.js";
import { mergeManifestFile } from "../lib/manifest.js";
import {
  DEFAULT_GITIGNORE_ENTRIES,
  getPackageJsonDefaults,
  getPrettierDefaults,
  getVscodeLaunchDefaults,
  getVscodeSettingsDefaults,
  HUSKY_PRE_COMMIT_CONTENT,
} from "../lib/defaults.js";
import { parseBitbucketRemote } from "../lib/bitbucket.js";
import { runSetupCi } from "./setup-ci.js";

export interface InitOptions {
  destRoot?: string;
  skipInstall?: boolean;
  skipBitbucket?: boolean;
}

export interface ScaffoldOptions {
  overwriteStatic?: boolean;
}

/**
 * Locates the CLI package root by walking up until template markers exist.
 */
export function findPackageRoot(startDir: string): string {
  let current = path.resolve(startDir);
  const filesystemRoot = path.parse(current).root;

  while (current !== filesystemRoot) {
    const marker = path.join(current, "templates", "dynamic", "package.xml");
    if (existsSync(marker)) {
      return current;
    }
    current = path.dirname(current);
  }

  throw new Error(
    "Could not locate generator-ccc package root (missing templates/dynamic/package.xml)"
  );
}

const PACKAGE_ROOT = findPackageRoot(path.dirname(fileURLToPath(import.meta.url)));
export const STATIC_TEMPLATE_DIR = path.join(PACKAGE_ROOT, "templates", "static");
export const DEFAULT_MANIFEST_TEMPLATE = path.join(PACKAGE_ROOT, "templates", "dynamic", "package.xml");

/**
 * Resolves the destination root for scaffolding (defaults to cwd).
 */
export function resolveDestRoot(destRoot?: string): string {
  return path.resolve(destRoot ?? process.cwd());
}

/**
 * Runs the init scaffold: copies templates, merges configs, and optionally installs deps.
 */
export async function runInit(options: InitOptions = {}): Promise<void> {
  const destRoot = resolveDestRoot(options.destRoot);

  p.intro("Callaway Cloud SFDX Project");

  const detectedBranch = detectDefaultBranch(destRoot);
  const branchAnswer = await p.text({
    message: "Default git branch",
    initialValue: detectedBranch,
    validate(value) {
      if (!value || value.trim().length === 0) {
        return "Branch name is required";
      }
      return undefined;
    },
  });

  if (p.isCancel(branchAnswer)) {
    p.cancel("Init cancelled.");
    process.exit(0);
  }

  const defaultBranch = branchAnswer.trim();
  const ctx = createProjectContext(destRoot, defaultBranch);

  const spinner = p.spinner();
  spinner.start("Writing project files");

  let summary: ScaffoldSummary;
  try {
    summary = await scaffoldProject(ctx);
  } catch (error) {
    spinner.stop("Failed to write project files");
    p.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  spinner.stop("Project files written");

  if (!options.skipInstall) {
    runInstall(ctx.destRoot);
  }

  printOutro(summary, options.skipInstall === true);

  const bitbucketRemote = parseBitbucketRemote(destRoot);
  if (!options.skipBitbucket && bitbucketRemote !== null) {
    const configureBitbucket = await p.confirm({
      message: "Configure Bitbucket Pipelines now?",
    });

    if (p.isCancel(configureBitbucket)) {
      p.cancel("Init cancelled.");
      process.exit(0);
    }

    if (configureBitbucket) {
      await runSetupCi({ destRoot });
    }
  }
}

/**
 * Installs sf plugin and npm dependencies in the project directory.
 */
export function runInstall(destRoot: string): void {
  const installSpinner = p.spinner();
  installSpinner.start("Installing sfdx-git-delta plugin");

  const sfResult = spawnSync("sf", ["plugins", "install", "sfdx-git-delta"], {
    cwd: destRoot,
    stdio: "inherit",
  });

  if (sfResult.status !== 0) {
    installSpinner.stop("sf plugin install failed");
    p.log.warn("sf plugins install sfdx-git-delta failed — run manually if needed");
  } else {
    installSpinner.stop("sfdx-git-delta plugin installed");
  }

  const npmSpinner = p.spinner();
  npmSpinner.start("Running npm install");

  const npmResult = spawnSync("npm", ["install"], {
    cwd: destRoot,
    stdio: "inherit",
  });

  if (npmResult.status !== 0) {
    npmSpinner.stop("npm install failed");
    p.log.error("npm install failed");
    process.exit(1);
  }

  npmSpinner.stop("npm install complete");
}

/**
 * Applies all scaffold file operations for init/upgrade.
 */
export async function scaffoldProject(
  ctx: ProjectContext,
  options: ScaffoldOptions = {}
): Promise<ScaffoldSummary> {
  const summary = createScaffoldSummary();

  const staticSummary = copyStaticTemplates({
    templateDir: STATIC_TEMPLATE_DIR,
    destRoot: ctx.destRoot,
    defaultBranch: ctx.defaultBranch,
    overwriteStatic: options.overwriteStatic,
  });
  mergeSummaries(summary, staticSummary);

  const manifestPath = path.join(ctx.destRoot, "manifest", "package.xml");
  const defaultManifestContent = readFileSync(DEFAULT_MANIFEST_TEMPLATE, "utf-8");
  const manifestResult = await mergeManifestFile(manifestPath, defaultManifestContent);
  recordResult(summary, "manifest/package.xml", manifestResult);

  mergeJsonDefaultsFile(
    summary,
    path.join(ctx.destRoot, "package.json"),
    "package.json",
    getPackageJsonDefaults(ctx)
  );
  mergeJsonDefaultsFile(
    summary,
    path.join(ctx.destRoot, ".prettierrc"),
    ".prettierrc",
    getPrettierDefaults()
  );
  mergeJsonDefaultsFile(
    summary,
    path.join(ctx.destRoot, ".vscode", "settings.json"),
    ".vscode/settings.json",
    getVscodeSettingsDefaults()
  );
  mergeJsonDefaultsFile(
    summary,
    path.join(ctx.destRoot, ".vscode", "launch.json"),
    ".vscode/launch.json",
    getVscodeLaunchDefaults()
  );

  const gitignoreResult = appendGitignore(ctx.destRoot, DEFAULT_GITIGNORE_ENTRIES);
  recordResult(summary, ".gitignore", gitignoreResult);

  const huskyPath = path.join(ctx.destRoot, ".husky", "pre-commit");
  const huskyResult = writeTextFile(huskyPath, HUSKY_PRE_COMMIT_CONTENT, { mode: 0o755 });
  recordResult(summary, ".husky/pre-commit", huskyResult);

  return summary;
}

/**
 * Merges a secondary summary into the primary summary.
 */
function mergeSummaries(target: ScaffoldSummary, source: ScaffoldSummary): void {
  target.created.push(...source.created);
  target.merged.push(...source.merged);
  target.skipped.push(...source.skipped);
}

/**
 * Prints the init/upgrade outro with file action summary.
 */
function printOutro(summary: ScaffoldSummary, skippedInstall: boolean): void {
  const lines: string[] = [];

  if (summary.created.length > 0) {
    lines.push(`Created (${summary.created.length}): ${summary.created.join(", ")}`);
  }
  if (summary.merged.length > 0) {
    lines.push(`Merged (${summary.merged.length}): ${summary.merged.join(", ")}`);
  }
  if (summary.skipped.length > 0) {
    lines.push(`Skipped (${summary.skipped.length}): ${summary.skipped.join(", ")}`);
  }
  if (skippedInstall) {
    lines.push("Install skipped (--skip-install)");
  }

  p.outro(lines.length > 0 ? lines.join("\n") : "No files changed");
}

export { printOutro };
