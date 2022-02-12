#!/bin/bash

set -e

cd lambda-frikily >/dev/null
echo "Compressing lambda..."
rm -f ../lambda-frikily.zip
zip -q -r ../lambda-frikily.zip *
cd - >/dev/null
