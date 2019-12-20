# ⚡️🤘⚡️Callaway Cloud CI ⚡️🤘⚡️

This guide will outline the steps to setup and use a bitbucket pipeline for auto-deployments.

<img width="1370" alt="callawaycloud___realself___Pipelines_—_Bitbucket" src="https://user-images.githubusercontent.com/5217568/70212789-2d3d1d80-16f5-11ea-8795-93aac82fdde6.png">

_NOTE:_ This setup currently only works with the "Org Development Model" (manifest package.xml).

## 💪 Goals

1. Make it easy to validate changes on Pull Request
2. Handle 75-90% of deployments automatically. Exceptions:
   - Metadata not tracked in source control (email template, named cred, etc)
   - Complex destructive changes
   - Profile configurations
   - Data configuration
3. Only deploy metadata that has changed.
4. Make it impossible to overwrite changes that have been introduced outside of our source control (dang :wombats:)
5. Keep `master` in sync with production
6. Do all of this without overloading the deployment queue

## 💻 Development Workflow

For this CI process to work you just need to follow a one simple rule:

**Master == Production**

Nothing should ever be committed or merged into master unless it has already successfully been deployed.  The CI process itself will ensure that this happens.

A typical development flow would look like this:

1. Developer creates feature branch off master
1. Developer builds & commits changes
1. creates PR back into master.  The CI will automatically sync production & build the deployment package.   This lets us know that there are no merge conflicts as soon as possible.
1. Once the package build successfully the developer can go ahead manually kick off the "Check Package" step.  This confirms that the PR is deployable and all tests pass
1. Once the PR has been approved and you are ready to deploy, you can run "Quick Deploy".  If the previously checked deployment has been invalidated, you can either rerun the check package step, or manually kick off one of the full pipeline variants.
1. Once the pipeline completes your done! The branch will automatically be merged and cleaned up.

## 🔧 Setup

### Build Scripts

The easiest way to add this pipeline to a project is to use the [callaway yeoman generator](https://github.com/ChuckJonas/generator-ccc):

1. run `npm install -g yo`
2. run `npm install -g generator-ccc`
3. `cd` to project
4. run `yo ccc`

**NOTE:** When running from windows, the `build/*.sh` files do not seem to retain their executable permission. You'll need to figure out a way to [make the files linux executable](https://unix.stackexchange.com/questions/256964/transferring-executable-files-from-windows-to-linux-via-winscp) for the pipeline ci to run.

Alternately, you could copy the [build folder](https://github.com/ChuckJonas/generator-ccc/tree/master/generators/app/templates/static/build) & [bitbucket-pipelines.yml](https://github.com/ChuckJonas/generator-ccc/blob/master/generators/app/templates/static/bitbucket-pipelines.yml) to your project.

### Environment Setup

1. Authorize the production org with sfdx-cli
1. Run `sfdx force:org:display --verbose -u your-prod-user`. Copy the returned "Sfdx Auth Url"
1. Open the repo in bitbucket
1. Navigate to "Settings -> Pipelines -> Settings"
1. Enable Pipelines
1. Navigate to "Settings -> Pipelines -> Repository variables"
1. Create a new variable called AUTH_URL. **MAKE SURE TO CHECK THE SECURE OPTION!!!**

## 🌊 Pipeline Steps

<img width="300" alt="callawaycloud___ci-example-repo___Pipelines_—_Bitbucket" src="https://user-images.githubusercontent.com/5217568/70215690-4b0d8100-16fb-11ea-95d5-b7f5b0afc2f5.png">

### 1: "Build Package"

**Trigger:** Pull Request Created/Updated

1. It syncs Production into `master` (using [force:source:clean](https://github.com/ChuckJonas/force-source-clean)) and pushes the changes
2. It merges `master` into the current branch
3. It generates an incremental deployment package based on the difference between `master` and the current branch (using [sfdx-git-packager](https://github.com/ChuckJonas/sfdx-git-packager))

After completing, you can inspect the package by downloading the "artifacts".

<img width="800" alt="callawaycloud___ci-example-repo___Pipelines_—_Bitbucket" src="https://user-images.githubusercontent.com/5217568/70214463-b6a21f00-16f8-11ea-9530-87dff421d7b5.png">

❗️ Merge conflict

If you encounter merge conflicts, that means that a file you've changed in your current branch has also been updated in production by some rogue :wombat:.

Checkout master and locally merge the conflicts. Push and the PR pipeline will automatically run again.

❗️ Package generation failed

[Possible a bug?](https://github.com/ChuckJonas/sfdx-git-packager/issues)

### 2: "Check Package"

**Trigger:** Manual

This step preforms a `--CHECKONLY` deployment with the generated package.

❗️ **Missing Metadata Dependencies**

- If it's something we track in source control, pull it down/commit/push and try again.
- Otherwise, you will need to manually deploy it via a changeset (or other means).

❗️ **Failed Tests**

Ideally you should fix the tests, commit changes, and try again. However, if the test failures are not related to your feature, you can manually run the pipeline with selective tests:

<img width="550" alt="callawaycloud___ci-example-repo___Branches_—_Bitbucket" src="https://user-images.githubusercontent.com/5217568/70218930-2ddbb100-1701-11ea-8290-491db3afd2e3.png">

❗️ **Contains destructive changes which cannot be deployed atomicity**

This may require you to run multiple manual deployments.

### 3: "Quick Deploy"

**Trigger:** Manual

1. Completes the deployment you previously checked
2. Merges the current branch into `master`

No additional steps are required to close the pull request, although you might want to delete the remote branch.

❗️ **Deployment Failed**

Most likely the [previously checked deployment is no longer valid](https://salesforce.stackexchange.com/questions/187859/what-operations-would-cause-a-validated-changeset-to-become-invalidated-and-lose).
