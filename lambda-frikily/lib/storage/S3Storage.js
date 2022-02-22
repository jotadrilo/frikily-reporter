const AWS = require('aws-sdk');

AWS.config.update({ region: 'eu-west-2' })

class S3Storage {
    constructor(bucket) {
        this.bucket = bucket
        this.s3 = new AWS.S3()

        console.log(`# S3Storage configured [bucket: ${this.bucket}]`)
    }

    async store(name, body) {
        await this.s3.upload({ Bucket: this.bucket, Key: name, Body: body }).promise()
    }

    async read(name, callback) {
        try {
            await this.s3.getObject({ Bucket: this.bucket, Key: name }).promise().then(
                (data) => {
                    callback(data.Body.toString('utf-8'))
                }
            )
        } catch (err) {
            console.log(err)
        }
    }
}

module.exports = S3Storage
