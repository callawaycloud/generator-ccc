#!/bin/bash

echo "Reverting commit on a rollback branch"
git stash -u
git checkout master
git pull
git checkout -b rollback/${1}
git revert ${1} --no-edit

echo ""
echo "Pushing rollback branch to org"
git push origin rollback/${1}

echo ""
echo "Making a pull request"
curl -X POST -H "Content-Type: application/json" https://${BITBUCKET_USERNAME}:${BITBUCKET_APP_PASSWORD}@api.bitbucket.org/2.0/repositories/${BITBUCKET_WORKSPACE}/${BITBUCKET_REPO_SLUG}/pullrequests -d "{ \"title\": \"rollback/${1}\", \"description\": \"Rolling back commit ${1}\", \"source\": { \"branch\": { \"name\": \"rollback/${1}\" }, \"destination\": { \"branch\": { \"name\": \"master\" } } }, \"close_source_branch\": true }"