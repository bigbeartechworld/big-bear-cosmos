#!/bin/bash

rm -rf casaos
node convert.js
git diff --name-status --diff-filter=D | grep -E "\.(png|jpg)$" | cut -f 2 | xargs -r git reset HEAD --
