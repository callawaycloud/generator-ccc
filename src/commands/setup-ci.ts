import * as p from "@clack/prompts";
import { BitbucketClient, parseBitbucketRemote } from "../lib/bitbucket.js";
import { detectDefaultBranch } from "../lib/context.js";
import { getSfdxAuthUrl } from "../lib/sf.js";

export interface SetupCiOptions {
  destRoot?: string;
}

const AUTH_URL_VARIABLE = "AUTH_URL";
const SCHEDULED_PIPELINE_NAME = "Scheduled Production Sync";
const SCHEDULED_PIPELINE_CRON = "0 0 3 * * ? *";

/**
 * Prints a manual Bitbucket CI setup checklist with repository-specific URLs.
 */
export function printManualChecklist(
  workspace: string | null,
  repoSlug: string | null,
  defaultBranch: string
): void {
  const lines: string[] = ["Manual Bitbucket CI setup:", "", "1. Enable Pipelines"];

  if (workspace !== null && repoSlug !== null) {
    lines.push(`   ${`https://bitbucket.org/${workspace}/${repoSlug}/admin/pipelines/settings`}`);
  } else {
    lines.push("   Repository settings → Pipelines → Settings → Enable Pipelines");
  }

  lines.push(
    "",
    "2. Add secured AUTH_URL variable",
    "   Run `sf org display --verbose` and copy the Sfdx Auth URL."
  );

  if (workspace !== null && repoSlug !== null) {
    lines.push(
      `   ${`https://bitbucket.org/${workspace}/${repoSlug}/admin/pipelines/repository-variables`}`
    );
  } else {
    lines.push("   Repository settings → Pipelines → Repository variables");
  }

  lines.push(
    "   Create a secured variable named AUTH_URL.",
    "",
    "3. Schedule production sync",
    `   Branch: ${defaultBranch}`,
    `   Pipeline: ${SCHEDULED_PIPELINE_NAME}`,
    "   Interval: daily at 3:00 AM"
  );

  if (workspace !== null && repoSlug !== null) {
    lines.push(`   ${`https://bitbucket.org/${workspace}/${repoSlug}/admin/pipelines/schedules`}`);
  } else {
    lines.push("   Pipelines → Schedules → New schedule");
  }

  for (const line of lines) {
    p.log.info(line);
  }
}

/**
 * Configures Bitbucket Pipelines via the REST API (idempotent).
 */
export async function runSetupCi(options: SetupCiOptions = {}): Promise<void> {
  const destRoot = options.destRoot ?? process.cwd();
  const remote = parseBitbucketRemote(destRoot);
  const defaultBranch = detectDefaultBranch(destRoot);

  if (remote === null) {
    p.log.error("No Bitbucket origin remote detected.");
    printManualChecklist(null, null, defaultBranch);
    process.exit(1);
  }

  const { workspace, repoSlug } = remote;

  const useApi = await p.confirm({
    message:
      "Configure Bitbucket via API? Requires a repository access token with pipelines read/write.",
  });

  if (p.isCancel(useApi)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  if (!useApi) {
    printManualChecklist(workspace, repoSlug, defaultBranch);
    process.exit(0);
  }

  const tokenAnswer = await p.password({
    message: "Bitbucket repository access token",
    validate(value) {
      if (!value || value.trim().length === 0) {
        return "Token is required";
      }
      return undefined;
    },
  });

  if (p.isCancel(tokenAnswer)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const token = tokenAnswer.trim();
  const client = new BitbucketClient({ workspace, repoSlug, token });

  const configured: string[] = [];

  const pipelinesSpinner = p.spinner();
  pipelinesSpinner.start("Checking Bitbucket Pipelines");

  try {
    const enabled = await client.isPipelinesEnabled();
    if (enabled) {
      pipelinesSpinner.stop("Pipelines already enabled");
    } else {
      pipelinesSpinner.message("Enabling Bitbucket Pipelines");
      await client.enablePipelines();
      pipelinesSpinner.stop("Pipelines enabled");
      configured.push("enabled Pipelines");
    }
  } catch (error) {
    pipelinesSpinner.stop("Failed to configure Pipelines");
    p.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  let authUrl = await getSfdxAuthUrl();

  if (authUrl === null) {
    p.log.warn(
      "Could not read Sfdx Auth URL from `sf org display --verbose`. Authorize your production org first."
    );

    const manualAuthUrl = await p.password({
      message: "Paste Sfdx Auth URL (or cancel to skip AUTH_URL)",
    });

    if (p.isCancel(manualAuthUrl)) {
      p.log.warn("Skipped AUTH_URL variable setup.");
    } else if (manualAuthUrl.trim().length === 0) {
      p.log.warn("Skipped AUTH_URL variable setup.");
    } else {
      authUrl = manualAuthUrl.trim();
    }
  }

  if (authUrl !== null) {
    const authSpinner = p.spinner();
    authSpinner.start("Setting secured AUTH_URL variable");

    try {
      await client.setSecuredVariable(AUTH_URL_VARIABLE, authUrl);
      authSpinner.stop("AUTH_URL variable set");
      configured.push("set secured AUTH_URL");
    } catch (error) {
      authSpinner.stop("Failed to set AUTH_URL");
      p.log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  const scheduleSpinner = p.spinner();
  scheduleSpinner.start("Checking scheduled production sync");

  try {
    const hasSchedule = await client.hasSchedule(SCHEDULED_PIPELINE_NAME, defaultBranch);
    if (hasSchedule) {
      scheduleSpinner.stop("Scheduled production sync already exists");
    } else {
      scheduleSpinner.message("Creating scheduled production sync");
      await client.createSchedule(SCHEDULED_PIPELINE_NAME, defaultBranch, SCHEDULED_PIPELINE_CRON);
      scheduleSpinner.stop("Scheduled production sync created");
      configured.push(`scheduled "${SCHEDULED_PIPELINE_NAME}" on ${defaultBranch} (daily 3:00 AM)`);
    }
  } catch (error) {
    scheduleSpinner.stop("Failed to configure schedule");
    p.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (configured.length > 0) {
    p.outro(`Bitbucket CI configured: ${configured.join("; ")}.`);
  } else {
    p.outro("Bitbucket CI already fully configured.");
  }
}
