const fs = require('fs')
const path = require('path')

class LocalStorage {
    constructor(dir) {
        this.dir = dir

        fs.mkdirSync(this.dir, { recursive: true })
        console.log(`# LocalStorage configured [dir: ${this.dir}]`)
    }

    _getFile(name) {
        return path.join(this.dir, name)
    }

    async store(name, body) {
        const file = this._getFile(name)
        fs.writeFileSync(file, body)
    }

    async read(name, callback) {
        const file = this._getFile(name)
        try {
            const data = fs.readFileSync(file).toString()
            callback(data)
        } catch (err) {
            console.log(err)
        }
    }
}

module.exports = LocalStorage
