import { readFileSync } from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import { createProjectContext, detectDefaultBranch } from "../lib/context.js";
import {
  previewGitignoreChange,
  previewJsonDefaultsChange,
  previewStaticTemplateChanges,
  previewTextFileChange,
} from "../lib/files.js";
import { previewManifestMerge } from "../lib/manifest.js";
import {
  DEFAULT_GITIGNORE_ENTRIES,
  getPackageJsonDefaults,
  getPrettierDefaults,
  getVscodeLaunchDefaults,
  getVscodeSettingsDefaults,
  HUSKY_PRE_COMMIT_CONTENT,
} from "../lib/defaults.js";
import {
  DEFAULT_MANIFEST_TEMPLATE,
  printOutro,
  resolveDestRoot,
  runInstall,
  scaffoldProject,
  STATIC_TEMPLATE_DIR,
} from "./init.js";

export interface UpgradeOptions {
  destRoot?: string;
  skipInstall?: boolean;
  yes?: boolean;
}

/**
 * Runs the upgrade command with change preview and confirmation.
 */
export async function runUpgrade(options: UpgradeOptions = {}): Promise<void> {
  const destRoot = resolveDestRoot(options.destRoot);

  p.intro("Upgrade Callaway Cloud SFDX Project");

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
    p.cancel("Upgrade cancelled.");
    process.exit(0);
  }

  const defaultBranch = branchAnswer.trim();
  const ctx = createProjectContext(destRoot, defaultBranch);

  let changingFiles: string[];
  try {
    changingFiles = await collectChangingFiles(ctx);
  } catch (error) {
    p.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (changingFiles.length === 0) {
    p.log.info("All files are up to date.");
    p.outro("No changes needed");
    return;
  }

  p.log.message("Files that will change:");
  for (const file of changingFiles) {
    p.log.message(`  • ${file}`);
  }

  if (!options.yes) {
    const confirmed = await p.confirm({
      message: `Apply changes to ${changingFiles.length} file(s)?`,
      initialValue: true,
    });

    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel("Upgrade cancelled.");
      process.exit(0);
    }
  }

  const spinner = p.spinner();
  spinner.start("Writing project files");

  let summary;
  try {
    summary = await scaffoldProject(ctx, { overwriteStatic: true });
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
}

/**
 * Collects relative paths of files that would change during upgrade.
 */
async function collectChangingFiles(
  ctx: ReturnType<typeof createProjectContext>
): Promise<string[]> {
  const changes: string[] = [];

  const staticChanges = previewStaticTemplateChanges({
    templateDir: STATIC_TEMPLATE_DIR,
    destRoot: ctx.destRoot,
    defaultBranch: ctx.defaultBranch,
    overwriteStatic: true,
  });
  changes.push(...staticChanges);

  const manifestPath = path.join(ctx.destRoot, "manifest", "package.xml");
  const defaultManifestContent = readFileSync(DEFAULT_MANIFEST_TEMPLATE, "utf-8");
  const manifestPreview = await previewManifestMerge(manifestPath, defaultManifestContent);
  if (manifestPreview !== null) {
    changes.push("manifest/package.xml");
  }

  const jsonFiles: Array<{
    path: string;
    relative: string;
    defaults: ReturnType<typeof getPackageJsonDefaults>;
  }> = [
    {
      path: path.join(ctx.destRoot, "package.json"),
      relative: "package.json",
      defaults: getPackageJsonDefaults(ctx),
    },
    {
      path: path.join(ctx.destRoot, ".prettierrc"),
      relative: ".prettierrc",
      defaults: getPrettierDefaults(),
    },
    {
      path: path.join(ctx.destRoot, ".vscode", "settings.json"),
      relative: ".vscode/settings.json",
      defaults: getVscodeSettingsDefaults(),
    },
    {
      path: path.join(ctx.destRoot, ".vscode", "launch.json"),
      relative: ".vscode/launch.json",
      defaults: getVscodeLaunchDefaults(),
    },
  ];

  for (const file of jsonFiles) {
    if (previewJsonDefaultsChange(file.path, file.defaults)) {
      changes.push(file.relative);
    }
  }

  if (previewGitignoreChange(ctx.destRoot, DEFAULT_GITIGNORE_ENTRIES)) {
    changes.push(".gitignore");
  }

  const huskyPath = path.join(ctx.destRoot, ".husky", "pre-commit");
  if (previewTextFileChange(huskyPath, HUSKY_PRE_COMMIT_CONTENT)) {
    changes.push(".husky/pre-commit");
  }

  return [...new Set(changes)];
}
