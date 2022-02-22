const lib = require('./lib/frikily');
const catalogs = require('./catalogs.json');
const config = require('./config.s3.json')

exports.handler = async function (event, context) {
    // console.log("ENVIRONMENT VARIABLES\n" + JSON.stringify(process.env, null, 2))
    // console.log("EVENT\n" + JSON.stringify(event, null, 2))

    try {
        const allowed = ['K', 'J', 'M']

        const allowedCatalogs = Object.keys(catalogs)
            .filter(key => allowed.includes(key))
            .reduce((obj, key) => {
                obj[key] = catalogs[key]
                return obj
            }, {})

        await lib.run(allowedCatalogs, config.storage, config.emailTo)
    } catch (err) {
        return {
            statusCode: 502,
            body: JSON.stringify(err),
        }
    }

    return {
        statusCode: 200,
        body: JSON.stringify('Done!'),
    }
}
