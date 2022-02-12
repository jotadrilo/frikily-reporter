const lib = require('./lib/frikily');
const config = require('./config.json');

exports.handler = async function (event, context) {
    // console.log("ENVIRONMENT VARIABLES\n" + JSON.stringify(process.env, null, 2))
    // console.log("EVENT\n" + JSON.stringify(event, null, 2))

    try {
        const allowed = ['K', 'J']

        const catalogs = Object.keys(config.catalogs)
            .filter(key => allowed.includes(key))
            .reduce((obj, key) => {
                obj[key] = config.catalogs[key]
                return obj
            }, {})

        await lib.run(catalogs, config.storage, config.emailTo)
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
