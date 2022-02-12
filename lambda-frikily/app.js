const lib = require('./lib/frikily');
const config = require('./config.json');

try {
    const allowed = ['K', 'J']
    // const allowed = ['T']

    const catalogs = Object.keys(config.catalogs)
        .filter(key => allowed.includes(key))
        .reduce((obj, key) => {
            obj[key] = config.catalogs[key]
            return obj
        }, {})

    lib.run(catalogs, config.storage, config.emailTo)
        .then(r => console.log('Done!'))
} catch (err) {
    console.warn(`There was an error: ${err}`)
}
