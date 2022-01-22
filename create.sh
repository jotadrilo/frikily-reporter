#!/bin/bash

set -e

export AWS_REGION=eu-west-2

echo "Creating lambda..."
aws lambda create-function \
    --function-name lambda-frikily \
    --zip-file fileb://lambda-frikily.zip \
    --handler index.handler \
    --runtime nodejs14.x \
    --role arn:aws:iam::052585059257:role/lambda-frikily
