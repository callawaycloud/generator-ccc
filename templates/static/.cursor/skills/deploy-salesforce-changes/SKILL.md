---
name: deploy-salesforce-changes
description: Deploy Salesforce metadata changes to production via the Bitbucket pipeline. Use when the user wants to deploy, release, or ship a change.
---

# Deploy Salesforce Changes

## Golden rule

`{{defaultBranch}}` mirrors production. **Never commit or merge into it directly.** All changes go through feature branches and pull requests.

## Deployment workflow

1. **Create a feature branch** off `{{defaultBranch}}`.
2. **Commit your changes** under `src/` with a clear message.
3. **Open a pull request** targeting `{{defaultBranch}}`.
4. **Build Package** (automatic on PR) — syncs production into `{{defaultBranch}}`, merges into the PR branch, builds an incremental package via sfdx-git-delta.
5. **Check Package** (manual) — check-only deploy with tests; results appear on the PR. Review test results before proceeding.
6. **Quick Deploy** (manual) — quick deploys to production, auto-merges to `{{defaultBranch}}`, deletes the feature branch.

## PR description flags

| Flag | Effect |
| --- | --- |
| `!skipSync` | Skip production sync during Build Package |
| `!tests=Foo,Bar` | Run only listed test classes during Check Package |

## Full pipeline guide

See [docs/ci.md](../../../docs/ci.md) for the complete CI/CD reference, manual pipelines, and troubleshooting.
