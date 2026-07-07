# generator-ccc

One-command setup and upgrade tool for Callaway Cloud Salesforce projects.

It scaffolds a complete, modern development setup: an incremental Bitbucket Pipelines CI/CD flow (sf CLI v2 + sfdx-git-delta), prettier with a pre-commit hook, VS Code / Cursor tasks and AI rules, the Salesforce MCP server, and sensible project defaults — and it can configure Bitbucket for you via the API.

## Quick start

```bash
cd your-salesforce-project
npx generator-ccc
```

After a global install (`npm install -g generator-ccc`), the same commands work with the short `ccc` alias — for example, `ccc upgrade`.

That's it. The CLI will:

1. Detect your default branch and scaffold project files. JSON configs are deep-merged (existing values win); other files are created or updated as needed.
2. Install the `sfdx-git-delta` plugin and npm dependencies.
3. When the `origin` remote is a Bitbucket repository, offer to configure Bitbucket automatically — enable Pipelines, create the secured `AUTH_URL` variable from your authorized org, and schedule the daily production sync. Skip this prompt with `--skip-bitbucket`, or run `npx generator-ccc setup-ci` later.

## Commands

| Command                         | What it does                                                                                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx generator-ccc` (or `init`) | Scaffold a new project or merge defaults into an existing one                                                                                                                                                                                 |
| `npx generator-ccc upgrade`     | Preview files that would change, confirm, then re-apply templates. JSON configs are deep-merged (existing values win); non-JSON scaffold files (pipelines, build scripts, `.cursor/`, `docs/ci.md`, etc.) are updated to the latest templates |
| `npx generator-ccc doctor`      | Verify project files, build script permissions, sf CLI, and (with `BITBUCKET_TOKEN` set) Bitbucket Pipelines configuration                                                                                                                    |
| `npx generator-ccc setup-ci`    | Configure Bitbucket Pipelines via the API. Requires a Bitbucket `origin` remote; prompts for a repository access token                                                                                                                        |

### Flags

| Flag               | Scope                                              |
| ------------------ | -------------------------------------------------- |
| `--help`           | Global — show usage                                |
| `--skip-install`   | `init`, `upgrade` — skip sf plugin and npm install |
| `--skip-bitbucket` | `init` — skip the Bitbucket Pipelines setup prompt |
| `--yes`            | `upgrade` — skip the confirmation prompt           |

## What gets configured

1. **Bitbucket Pipelines CI/CD** — validate on PR, manual check + quick deploy, automatic merge and branch cleanup, scheduled production sync, JUnit test reporting, deployment dashboard, inline PR annotations, and automatic destructive-change handling. See the generated `docs/ci.md` for the full guide.
2. **Cursor / VS Code** — palette tasks for common Salesforce operations (retrieve, preview deployment package, run tests, open org), recommended extensions, Cursor project rules (`.cursor/rules/`), Cursor skills (`.cursor/skills/`), and the official Salesforce MCP server (`.cursor/mcp.json`).
3. **Formatting** — prettier 3 with `prettier-plugin-apex` and a husky pre-commit hook.
4. **Project defaults** — `manifest/package.xml`, `.gitignore` entries, VS Code settings, and npm scripts.

## Requirements

- Node.js 22+ (see `.nvmrc`)
- [Salesforce CLI (sf v2)](https://developer.salesforce.com/tools/salesforcecli) with your production org authorized

## Upgrading a v2 (Yeoman) project

Projects scaffolded with the old `yo ccc` generator can be migrated by running `npx generator-ccc upgrade` in the project. Review the change preview before confirming — the pipeline and build scripts change substantially (sfdx → sf CLI v2, sfdx-git-packager → sfdx-git-delta). The Yeoman generator is no longer published with this package.

## Development

1. `git clone https://github.com/callawaycloud/generator-ccc.git` && `npm install`
2. `npm run watch` while making changes in `src/`
3. `npm run typecheck`, `npm run lint`, and `npm test` before opening a PR
4. Test locally: `npm run build && node dist/bin.js init --skip-install` in a scratch directory
