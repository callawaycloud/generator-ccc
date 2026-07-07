---
name: salesforce-commands
description: Common sf CLI v2 commands for this project. Use when retrieving metadata, previewing a deployment package, running Apex tests, or opening the org.
---

# Salesforce CLI Commands

This project uses **sf CLI v2** only — never legacy `sfdx force:*` commands.

## Common commands

| Task                       | Command                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| Retrieve changes           | `sf project retrieve start --manifest manifest/package.xml`                                          |
| Preview deployment package | `sf sgd source delta --from "origin/{{defaultBranch}}" --to HEAD --output-dir dist --generate-delta` |
| Run tests (current file)   | `sf apex run test --tests <ClassName> --result-format human --synchronous`                           |
| Deploy single file         | `sf project deploy start --source-dir <path>`                                                        |
| Check org connection       | `sf org display`                                                                                     |

## VS Code / Cursor tasks

Use the palette tasks prefixed with **SF:** for palette-friendly access to these commands.
