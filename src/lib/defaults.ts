import type { JsonObject } from "./json-merge.js";
import type { ProjectContext } from "./context.js";

/**
 * Default package.json scaffold values (modernized for sf CLI v2 and husky 9).
 */
export function getPackageJsonDefaults(ctx: ProjectContext): JsonObject {
  return {
    name: ctx.projectName,
    scripts: {
      "pretty-quick": "pretty-quick --staged",
      "pretty-all-apex": 'prettier --write "src/**/*.{trigger,cls}"',
      delta: `sf sgd source delta --to HEAD --from origin/${ctx.defaultBranch} --output-dir dist`,
      retrieve: "sf project retrieve start -x manifest/package.xml",
    },
    devDependencies: {
      husky: "^9",
      prettier: "^3",
      "prettier-plugin-apex": "^2",
      "pretty-quick": "^4",
    },
  };
}

/**
 * Default .prettierrc scaffold values.
 */
export function getPrettierDefaults(): JsonObject {
  return {
    trailingComma: "none",
    printWidth: 120,
    tabWidth: 4,
    apexInsertFinalNewline: false,
    overrides: [
      {
        files: "*.{cmp,page,component}",
        options: {
          parser: "html",
        },
      },
      {
        files: "*.yml",
        options: {
          tabWidth: 2,
        },
      },
      {
        files: "**/lwc/**/*.html",
        options: {
          parser: "lwc",
        },
      },
    ],
  };
}

/**
 * Default .vscode/settings.json scaffold values.
 */
export function getVscodeSettingsDefaults(): JsonObject {
  return {
    "salesforcedx-vscode-core.show-cli-success-msg": false,
    "salesforcedx-vscode-core.push-or-deploy-on-save.enabled": true,
    "salesforcedx-vscode-core.detectConflictsAtSync": true,
    "editor.formatOnSave": true,
    "editor.formatOnSaveTimeout": 5000,
    "search.exclude": {
      "**/node_modules": true,
      "**/dist": true,
      "**/*.meta.xml": true,
    },
  };
}

/**
 * Default .vscode/launch.json scaffold values.
 */
export function getVscodeLaunchDefaults(): JsonObject {
  return {
    version: "0.2.0",
    configurations: [
      {
        name: "Launch Apex Replay Debugger",
        type: "apex-replay",
        request: "launch",
        logFile: "${command:AskForLogFileName}",
        stopOnEntry: true,
        trace: true,
      },
    ],
  };
}

/** Content written to .husky/pre-commit for husky 9. */
export const HUSKY_PRE_COMMIT_CONTENT = "bash build/format-commit.sh\n";

/** Entries appended to .gitignore when missing. */
export const DEFAULT_GITIGNORE_ENTRIES = ["dist/", "node_modules/", ".sf/", ".sfdx/"] as const;
