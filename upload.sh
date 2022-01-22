#!/bin/bash

set -e

export AWS_REGION=eu-west-2

echo "Uploading lambda..."
aws lambda update-function-code \
    --function-name lambda-frikily \
    --zip-file fileb://lambda-frikily.zip
