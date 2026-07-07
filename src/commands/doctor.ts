import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as p from "@clack/prompts";
import { BitbucketClient, parseBitbucketRemote } from "../lib/bitbucket.js";
import { detectDefaultBranch } from "../lib/context.js";

export interface DoctorResult {
  passed: boolean;
  message: string;
}

export interface DoctorCheck {
  name: string;
  run: () => DoctorResult | Promise<DoctorResult>;
}

const REQUIRED_FILES = [
  "bitbucket-pipelines.yml",
  "build/format-commit.sh",
  "build/insights.sh",
  "build/merge.sh",
  "build/package.sh",
  "build/schedule.sh",
  "build/setup.sh",
  "build/sync.sh",
  "build/lib/annotations.sh",
  "build/lib/package-stats.sh",
  "manifest/package.xml",
] as const;

const REQUIRED_SHELL_FILES = [
  "build/format-commit.sh",
  "build/insights.sh",
  "build/merge.sh",
  "build/package.sh",
  "build/schedule.sh",
  "build/setup.sh",
  "build/sync.sh",
  "build/lib/annotations.sh",
  "build/lib/package-stats.sh",
] as const;

/**
 * Checks whether the sf CLI is available on PATH.
 */
function checkSfCli(): DoctorResult {
  const result = spawnSync("sf", ["--version"], { encoding: "utf-8" });
  if (result.error || result.status !== 0) {
    return {
      passed: false,
      message: "sf CLI not found on PATH",
    };
  }
  const version = (result.stdout ?? result.stderr ?? "").trim();
  return {
    passed: true,
    message: version.length > 0 ? `sf CLI: ${version.split("\n")[0]}` : "sf CLI found",
  };
}

/**
 * Checks whether a default Salesforce org is authorized.
 */
function checkDefaultOrg(): DoctorResult {
  const result = spawnSync("sf", ["org", "display", "--json"], {
    encoding: "utf-8",
  });

  if (result.error || result.status !== 0) {
    return {
      passed: false,
      message: "No default org authorized (sf org display failed)",
    };
  }

  try {
    const parsed: unknown = JSON.parse(result.stdout ?? "{}");
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "status" in parsed &&
      parsed.status === 0
    ) {
      return {
        passed: true,
        message: "Default org authorized",
      };
    }
    return {
      passed: false,
      message: "No default org authorized",
    };
  } catch {
    return {
      passed: false,
      message: "Failed to parse sf org display output",
    };
  }
}

/**
 * Checks whether required project files exist.
 */
function checkRequiredFiles(): DoctorResult {
  const cwd = process.cwd();
  const missing: string[] = [];

  for (const file of REQUIRED_FILES) {
    if (!existsSync(path.join(cwd, file))) {
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    return {
      passed: false,
      message: `Missing files: ${missing.join(", ")}`,
    };
  }

  return {
    passed: true,
    message: `All ${REQUIRED_FILES.length} required files present`,
  };
}

/**
 * Checks whether .sh build scripts are executable.
 */
function checkShellExecutable(): DoctorResult {
  const cwd = process.cwd();
  const notExecutable: string[] = [];

  for (const file of REQUIRED_SHELL_FILES) {
    const filePath = path.join(cwd, file);
    if (!existsSync(filePath)) {
      continue;
    }
    const mode = statSync(filePath).mode;
    const isExecutable = (mode & 0o111) !== 0;
    if (!isExecutable) {
      notExecutable.push(file);
    }
  }

  if (notExecutable.length > 0) {
    return {
      passed: false,
      message: `Not executable: ${notExecutable.join(", ")}`,
    };
  }

  return {
    passed: true,
    message: "All build/*.sh files are executable",
  };
}

const AUTH_URL_VARIABLE = "AUTH_URL";
const SCHEDULED_PIPELINE_NAME = "Scheduled Production Sync";

/**
 * Checks whether origin points at a Bitbucket repository.
 */
function checkBitbucketRemote(): Promise<DoctorResult> {
  const remote = parseBitbucketRemote(process.cwd());

  if (remote === null) {
    return Promise.resolve({
      passed: false,
      message: "Origin remote is not a Bitbucket repository",
    });
  }

  return Promise.resolve({
    passed: true,
    message: `Bitbucket remote: ${remote.workspace}/${remote.repoSlug}`,
  });
}

/**
 * Returns authenticated Bitbucket checks when BITBUCKET_TOKEN is set.
 */
function getBitbucketAuthenticatedChecks(): DoctorCheck[] {
  const token = process.env.BITBUCKET_TOKEN;
  if (token === undefined || token.trim().length === 0) {
    return [];
  }

  const remote = parseBitbucketRemote(process.cwd());
  if (remote === null) {
    return [];
  }

  const client = new BitbucketClient({
    workspace: remote.workspace,
    repoSlug: remote.repoSlug,
    token: token.trim(),
  });
  const defaultBranch = detectDefaultBranch(process.cwd());

  return [
    {
      name: "Bitbucket Pipelines",
      run: async (): Promise<DoctorResult> => {
        try {
          const enabled = await client.isPipelinesEnabled();
          if (!enabled) {
            return {
              passed: false,
              message: "Pipelines are not enabled",
            };
          }
          return {
            passed: true,
            message: "Pipelines enabled",
          };
        } catch (error) {
          return {
            passed: false,
            message: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },
    {
      name: "Bitbucket AUTH_URL",
      run: async (): Promise<DoctorResult> => {
        try {
          const variable = await client.getVariable(AUTH_URL_VARIABLE);
          if (variable === null) {
            return {
              passed: false,
              message: "Secured AUTH_URL variable not found",
            };
          }
          return {
            passed: true,
            message: "AUTH_URL variable configured",
          };
        } catch (error) {
          return {
            passed: false,
            message: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },
    {
      name: "Bitbucket schedule",
      run: async (): Promise<DoctorResult> => {
        try {
          const hasSchedule = await client.hasSchedule(
            SCHEDULED_PIPELINE_NAME,
            defaultBranch
          );
          if (!hasSchedule) {
            return {
              passed: false,
              message: `"${SCHEDULED_PIPELINE_NAME}" schedule not found on ${defaultBranch}`,
            };
          }
          return {
            passed: true,
            message: `"${SCHEDULED_PIPELINE_NAME}" scheduled on ${defaultBranch}`,
          };
        } catch (error) {
          return {
            passed: false,
            message: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },
  ];
}

/** Base doctor checks that do not require runtime environment state. */
export const doctorChecks: DoctorCheck[] = [
  { name: "sf CLI", run: checkSfCli },
  { name: "Default org", run: checkDefaultOrg },
  { name: "Required files", run: checkRequiredFiles },
  { name: "Shell scripts", run: checkShellExecutable },
  { name: "Bitbucket remote", run: checkBitbucketRemote },
];

/**
 * Runs all doctor checks and exits with code 1 if any fail.
 */
export async function runDoctor(): Promise<void> {
  p.intro("CCC Project Doctor");

  const bitbucketToken = process.env.BITBUCKET_TOKEN;
  if (bitbucketToken === undefined || bitbucketToken.trim().length === 0) {
    p.log.info("Set BITBUCKET_TOKEN to verify pipeline configuration");
  }

  let allPassed = true;

  const checks = [...doctorChecks, ...getBitbucketAuthenticatedChecks()];

  for (const check of checks) {
    const result = await check.run();
    if (result.passed) {
      p.log.success(`${check.name}: ${result.message}`);
    } else {
      p.log.error(`${check.name}: ${result.message}`);
      allPassed = false;
    }
  }

  if (allPassed) {
    p.outro("All checks passed");
    process.exit(0);
  }

  p.outro("Some checks failed");
  process.exit(1);
}
