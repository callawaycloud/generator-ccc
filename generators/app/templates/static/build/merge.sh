#!/bin/bash
echo 'merge branch into master'
git checkout master
git merge $BITBUCKET_BRANCH
git push
