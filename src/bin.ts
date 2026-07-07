#!/usr/bin/env node

import { runInit } from "./commands/init.js";
import { runUpgrade } from "./commands/upgrade.js";
import { runDoctor } from "./commands/doctor.js";
import { runSetupCi } from "./commands/setup-ci.js";

const USAGE = `generator-ccc — Callaway Cloud SFDX project scaffold

Usage:
  generator-ccc [command] [options]

Commands:
  init      Scaffold project files (default)
  upgrade   Upgrade existing project files
  setup-ci  Configure Bitbucket Pipelines via API
  doctor    Run environment and project checks

Options:
  --help              Show this help message
  --skip-install      Skip sf plugin and npm install (init/upgrade)
  --skip-bitbucket    Skip Bitbucket Pipelines setup prompt (init)
  --yes               Skip confirmation prompt (upgrade)

Examples:
  npx generator-ccc
  npx generator-ccc init --skip-install
  npx generator-ccc init --skip-bitbucket
  npx generator-ccc setup-ci
  npx generator-ccc upgrade --yes
  npx generator-ccc doctor
`;

/**
 * Parses CLI flags from process.argv.
 */
function parseFlags(argv: string[]): {
  skipInstall: boolean;
  skipBitbucket: boolean;
  yes: boolean;
} {
  return {
    skipInstall: argv.includes("--skip-install"),
    skipBitbucket: argv.includes("--skip-bitbucket"),
    yes: argv.includes("--yes"),
  };
}

/**
 * Prints usage text without exiting.
 */
function printHelp(): void {
  console.log(USAGE);
}

/**
 * Prints usage and exits successfully.
 */
function showHelp(): void {
  printHelp();
  process.exit(0);
}

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flags = parseFlags(argv);
  const positional = argv.filter((arg) => !arg.startsWith("-"));
  const command = positional[0] ?? "init";

  if (command === "--help" || command === "help" || argv.includes("--help")) {
    showHelp();
    return;
  }

  switch (command) {
    case "init":
      await runInit({
        skipInstall: flags.skipInstall,
        skipBitbucket: flags.skipBitbucket,
      });
      break;
    case "upgrade":
      await runUpgrade({ skipInstall: flags.skipInstall, yes: flags.yes });
      break;
    case "setup-ci":
      await runSetupCi();
      break;
    case "doctor":
      await runDoctor();
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      printHelp();
      process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
