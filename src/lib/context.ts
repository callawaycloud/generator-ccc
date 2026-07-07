import { spawnSync } from "node:child_process";
import path from "node:path";

/**
 * Runtime context for scaffolding a Salesforce project.
 */
export interface ProjectContext {
  destRoot: string;
  defaultBranch: string;
  projectName: string;
}

/**
 * Detects the default git branch for a project directory.
 * Checks origin HEAD, then local main/master, defaulting to "main".
 */
export function detectDefaultBranch(cwd: string): string {
  const originHead = spawnSync("git", ["symbolic-ref", "refs/remotes/origin/HEAD"], {
    cwd,
    encoding: "utf-8",
  });

  if (originHead.status === 0 && originHead.stdout) {
    const trimmed = originHead.stdout.trim();
    const prefix = "refs/remotes/origin/";
    if (trimmed.startsWith(prefix)) {
      const branch = trimmed.slice(prefix.length);
      if (branch.length > 0) {
        return branch;
      }
    }
  }

  if (branchExists(cwd, "main")) {
    return "main";
  }

  if (branchExists(cwd, "master")) {
    return "master";
  }

  return "main";
}

/**
 * Returns true when a local git branch ref exists.
 */
function branchExists(cwd: string, branchName: string): boolean {
  const result = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], {
    cwd,
  });
  return result.status === 0;
}

/**
 * Builds a ProjectContext for the given destination directory and branch.
 */
export function createProjectContext(destRoot: string, defaultBranch: string): ProjectContext {
  return {
    destRoot: path.resolve(destRoot),
    defaultBranch,
    projectName: path.basename(path.resolve(destRoot)),
  };
}
