const lib = require('./lib/frikily')
const catalogs = require('./catalogs.json')
const config = process.env.CONFIG_LOCAL === '1' ? require('./config.local.json') : require('./config.s3.json')

try {
    const allowed = ['K', 'J', 'M']
    // const allowed = ['T']

    const allowedCatalogs = Object.keys(catalogs)
        .filter(key => allowed.includes(key))
        .reduce((obj, key) => {
            obj[key] = catalogs[key]
            return obj
        }, {})

    lib.run(allowedCatalogs, config.storage, config.emailTo)
        .then(r => console.log('Done!'))
} catch (err) {
    console.warn(`There was an error: ${err}`)
}
