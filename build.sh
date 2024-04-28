#!/bin/bash

rm -rf casaos
node convert.js
git diff --name-status --diff-filter=D | grep -E '\.(png|jpg)$' | awk '{print $2}' | while IFS= read -r file; do
    git checkout HEAD -- "$file"
    echo "Restored $file"
done
