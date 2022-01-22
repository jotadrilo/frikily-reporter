#!/bin/bash

set -e

export AWS_REGION=eu-west-2

echo "Invoking lambda..."
aws lambda invoke \
    --function-name lambda-frikily \
    --log-type Tail \
    --cli-binary-format raw-in-base64-out \
    run.log

cat run.log
