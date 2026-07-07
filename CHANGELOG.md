# Changelog

All notable changes to generator-ccc will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0-beta.0] - 2026-07-07

### Added
- Native TypeScript CLI with `init` (default), `upgrade`, `doctor`, and `setup-ci` commands, replacing the Yeoman generator workflow; `ccc` bin alias; scaffolded Cursor rules/skills and Salesforce MCP config (`.cursor/`).
- Publish inline Code Insights annotations on PRs for Code Analyzer findings, deploy component failures, and Apex test failures.
- Add `analysis` mode to `insights.sh` for a Code Analysis report card (`ccc-analysis`).
- Document PR report cards and troubleshooting in `docs/ci.md`.
- Scaffold Cursor skills (`.cursor/skills/`) for deployment workflow and Salesforce CLI commands instead of `AGENTS.md`.
- Add `setup-ci` command to configure Bitbucket Pipelines via the REST API (enable pipelines, secured `AUTH_URL`, daily scheduled production sync).
- Add optional Bitbucket setup prompt at the end of `init` (skippable with `--skip-bitbucket`).
- Add Bitbucket remote and pipeline configuration checks to `doctor` (authenticated checks when `BITBUCKET_TOKEN` is set).

### Changed
- Replace Yeoman `yo ccc` scaffolding with `npx generator-ccc`; require Node.js 22+; `upgrade` now previews and re-applies templates.
- Show the plain-language deployment summary ("This deployment contains: 3 Flows, 2 Apex Classes. Deletions: 1 Field.") in the Deployment Package Code Insights card, which needs no repository variables.

### Removed
- The Yeoman generator (`generators/app`) is no longer published; `yo ccc` unsupported.
- Remove the PR deployment summary comment (`build/pr-comment.sh`); app-password auth posted comments as the credential owner's personal account, and the Code Insights card now carries the same summary with no credentials at all.

### Fixed
- Production-branch deletion guard in the merge pipeline script.
- Bitbucket credentials no longer echoed to pipeline logs during production sync.
- `!tests=` PR flag now passes multiple test classes to `sf` correctly.
- Create `dist` before running sfdx-git-delta in `build/package.sh` so the Build Package pipeline step no longer fails with "No directory found at dist".
- Fail the Check Package pipeline step when the check-only validation does not succeed, instead of silently passing when `sf project deploy report` exits 0 on a failed deployment.
- Clear package directories before retrieving during production sync so metadata deleted in the org is removed from the repo instead of lingering forever.
- Use `--output-file` instead of the removed `--output-dir` flag when running Salesforce Code Analyzer in the Build Package step.
- Use a valid `report_type` (`TEST`) when publishing the deployment package Code Insights card, fixing the HTTP 400 from the Bitbucket Reports API.
- Stop `insights.sh` printing success messages when the underlying Bitbucket API calls fail; it now logs clear warnings (including likely auth/scope causes) instead.

[Unreleased]: https://github.com/callawaycloud/generator-ccc/compare/v2.0.0-beta.0...HEAD
[2.0.0-beta.0]: https://github.com/callawaycloud/generator-ccc/compare/v2.0.0-alpha.0...v2.0.0-beta.0
