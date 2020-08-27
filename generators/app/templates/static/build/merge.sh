#!/bin/bash

#confirm deploy was in fact successful
DEPLOY_SUCCESS=$(sfdx force:mdapi:deploy:report --json | jq .result.success)
[ $DEPLOY_SUCCESS != 'true' ] && echo "Deployment Failed" && exit 1

# echo 'merge branch into master'
git checkout master
git merge $BITBUCKET_BRANCH
git push
git push origin --delete $BITBUCKET_BRANCH
