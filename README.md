# frikily-reporter

This application scrapes some products of the [Frikily](https://frikily.com/) webpage to send an email report with available ones.

## Local Execution

The safest way to run this application locally is:

```
WRITE_HTML_TO_DISK=1 FORCE_LOCAL=1 node lambda-frikily/app.js
```

Some useful environment variables:

| Env | Description |
| --- | ----------- |
| `AWS_PROFILE` | Sets the AWS profile to use |
| `FORCE_LOCAL` | Skips any remote connection if set to `1` |
| `FORCE_SEND_EMAIL` | Sends the report to the email even if there are no changes if set to `1` |
| `SKIP_DOWNLOAD` | Skips the report download if set to `1` |
| `SKIP_EMAIL` | Skips the email if set to `1` |
| `SKIP_UPLOAD` | Skips the report upload if set to `1` |
| `WRITE_HTML_TO_DISK` | Writes an `./index.html` file if set to `1` |

## Lambda Update

To update the AWS Lambda function, execute:

```
./upload.sh
```
