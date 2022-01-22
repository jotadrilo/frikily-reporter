#!/bin/bash

set -e

cd lambda-frikily >/dev/null
echo "Compressing lambda..."
rm ../lambda-frikily.zip
zip -q -r ../lambda-frikily.zip *
cd - >/dev/null
