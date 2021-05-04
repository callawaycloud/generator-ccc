#!/bin/bash

branchName=$(git rev-parse --abbrev-ref HEAD)

if [ $branchName = 'master' ]
then
    echo Skip Format on Master Branch
    exit 0
fi 

npm run pretty-quick
exit 0