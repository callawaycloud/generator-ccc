#!/bin/bash

#confirm deploy was in fact successful
DEPLOY_SUCCESS=$(sfdx force:mdapi:deploy:report --json | jq .result.success)
[ $DEPLOY_SUCCESS != 'true' ] && echo "Deployment Failed" && exit 1


echo ''
echo "Merging and squashing $BITBUCKET_BRANCH into master"
curl POST -H "Content-Type: application/json" https://${BITBUCKET_USERNAME}:${BITBUCKET_APP_PASSWORD}@api.bitbucket.org/2.0/repositories/${BITBUCKET_WORKSPACE}/${BITBUCKET_REPO_SLUG}/pullrequests/${BITBUCKET_PR_ID}/merge -d '{ "type": "", "close_source_branch": true, "merge_strategy": "squash" }'

# NOTE below on why we are using the bitbucket API to merge and squash the pull request
# Squashing a pull request in via command line causes the pull requests to remain open in the Bitbucket UI

# https://support.atlassian.com/bitbucket-cloud/docs/merge-a-pull-request/
# Note: When you enter git merge --squash in the command line locally, the pull request will remain in the ‘open’ state after you push the changes to Bitbucket.
# This is because we use the commit graph to detect that changes were applied, and when ‘squash merge’ is used, we cannot
# detect that the pull request was merged or display an accurate diff. The pull request will now contain identical changes
# between the two branches, so the pull request will show no diff. However, you will be able to see the commit history of the pull request and view the individual commits.