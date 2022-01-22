var AWS = require('aws-sdk')
var Diff = require('diff')
var axios = require('axios')
var checksum = require('checksum')
var cheerio = require('cheerio')
var tableify = require('tableify')

AWS.config.update({ region: 'eu-west-2' })
var ses = new AWS.SES({ apiVersion: '2010-12-01' })
var s3 = new AWS.S3()

const CALENDAR_EMOJI = '🗓️'
const DANGER_EMOJI = '⚠️'
const TRUE_EMOJI = '✅'
const FALSE_EMOJI = '❌'
const STANDBY_EMOJI = '⏸️'
const NEW_EMOJI = '🆕'
const STAR_EMOJI = '⭐'
const REPORT_HTML_NAME = 'report.html'
const REPORT_JSON_NAME = 'report.json'

function isThereStock($) {
    var inStockStr = $('div[class="summary entry-summary"]')
        .first().find('p[class="en-stock"]')
        .first().text().trim()
    var lastStock = getLastStock($)
    return inStockStr.match(/^En stock\s*$/) != null || lastStock != ''
}

function getLastStock($) {
    var lastStockStr = $('div[class="summary entry-summary"]')
        .first().find('p[class="ultimo-pedido"]')
        .first().text().trim()
    return lastStockStr.match(/^Queda.*/) != null
        ? lastStockStr.match(/^Queda.*/)
        : ''
}

async function processUrl(url, who) {
    // Fetch HTML of the page we want to scrape
    const { data } = await axios.get(url)
    // Load HTML we fetched in the previous line
    const $ = cheerio.load(data)

    const title = $('.page-header-title')
        .text()
        .replace('Funko Pop! ', '')
        .replace('**CAJA DAÑADA** ', 'DAÑADA: ')
        .replace(/#\d+\s+\([^\)]+\)/g, '')
    const prices = $('p[class="price"]')
        .find('bdi')
        .toArray()
        .map((e) => parseFloat($(e).text().replace(',', '.')))
        .sort()
    const nextStock = $('.disponibilidad2')
        .text()
        .replace('Disponibilidad aprox.: ', '')


    console.log(`  - Processing ${title}`)

    return {
        funko: title,
        url: url,
        prices: prices,
        who: who,
        inStock: isThereStock($),
        lastItems: getLastStock($),
        nextStock: nextStock,
    }
}

function getApplicants(url, catalogs) {
    var applicants = []
    var owners = Object.keys(catalogs)
    for (const owner of owners) {
        var catalog = catalogs[owner]
        if (catalog.includes(url)) {
            applicants.push(owner)
        }
    }
    if (applicants.length == 1) {
        return applicants[0]
    }
    return applicants.slice(0, applicants.length - 1).join(', ') + ` y ${applicants[applicants.length - 1]}`
}

function getBooleanEmoji(v) {
    return v ? TRUE_EMOJI : FALSE_EMOJI
}

async function generateReport(catalogs) {
    // Generate unique URLs list
    var urls = Array.from(new Set(Object.values(catalogs).flat()))

    // Process URLs to collect information
    console.log('# Processing URLs...')
    var data = []
    for (const url of urls) {
        const item = await processUrl(url, getApplicants(url, catalogs))
        data.push(item)
    }

    return data
}

function getPriceStr(prices) {
    if (prices.length > 1) {
        return `<del>${prices[0]}€</del> <b>${prices[1]}€</b> ${STAR_EMOJI}`
    }
    return `<b>${prices[0]}€</b>`
}

async function generateHtml(data, prevData) {
    var htmlData = []
    for (const product of data) {
        if (product.inStock || product.nextStock != '') {
            // Find differences of some fields
            const matches = prevData.filter(p => p.funko == product.funko)
            const isNew = matches.length == 0
            var prevPrice = ''
            var prevNextStock = ''
            var prevInStock = false
            var prevLastItems = ''
            if (!isNew) {
                try {
                    const p = matches[0]
                    prevPrice = getPriceStr(p.prices)
                    prevNextStock = p.nextStock
                    prevInStock = p.inStock
                    prevLastItems = p.lastItems
                } catch { }
            }

            var funko = `<a href="${product.url}">${product.funko}</a>`
            var curAvail = product.lastItems != ''
                ? `${DANGER_EMOJI} ${product.lastItems}`
                : getBooleanEmoji(product.inStock)
            var curStock = product.nextStock != ''
                ? `${CALENDAR_EMOJI} ${product.nextStock}`
                : curAvail
            var prevAvail = prevLastItems != ''
                ? `${DANGER_EMOJI} ${prevLastItems}`
                : getBooleanEmoji(prevInStock)
            var prevStock = prevNextStock != ''
                ? `${CALENDAR_EMOJI} ${prevNextStock}`
                : prevAvail
            var stock = curStock != prevStock
                ? `${curStock} (Prev: ${prevStock})`
                : curStock
            var price = getPriceStr(product.prices)
            var priceStr = price != prevPrice
                ? `${price} (Prev: ${prevPrice})`
                : price

            const item = {
                'Funko': funko,
                'Interesado': product.who,
                'Stock': isNew ? NEW_EMOJI : STANDBY_EMOJI,
                'Disponibilidad': stock,
                'Precio': priceStr,
            }
            htmlData.push(item)
        }
    }
    return tableify(htmlData)
}

async function upload(name, dir, body) {
    await s3.upload({ Bucket: dir, Key: name, Body: body }).promise()
}

async function download(name, dir, callback) {
    await s3.getObject({ Bucket: dir, Key: name }).promise().then(callback)
}

async function sendEmail(emailTo, subject, html) {
    var params = {
        Destination: {
            ToAddresses: [emailTo],
        },
        Message: {
            Body: {
                Html: {
                    Charset: 'UTF-8',
                    Data: html,
                },
            },
            Subject: {
                Charset: 'UTF-8',
                Data: subject
            },
        },
        Source: emailTo,
    }

    // Send email
    await ses.sendEmail(params).promise()
}

async function run(catalogs, storage, emailTo) {
    // Generate report
    const report = await generateReport(catalogs)

    // Download and compute the previous report.
    // This is helpful to identify if the data has changed by checking
    // the checksum, and compute the differences.
    var prevReportStr = ''
    var prevReportHash = ''
    await download(REPORT_JSON_NAME, storage.bucket, (data) => {
        prevReportStr = data.Body.toString('utf-8')
        prevReportHash = checksum(prevReportStr)
    })

    // Generate and upload the HTML report
    const html = await generateHtml(report, JSON.parse(prevReportStr))
    await upload(REPORT_HTML_NAME, storage.bucket, html)

    // Compute and upload the new report hash
    var reportStr = JSON.stringify(report, null, 2)
    var newReportHash = checksum(reportStr)
    await upload(REPORT_JSON_NAME, storage.bucket, reportStr)

    // Send an email if the new and previous reports differ
    if (prevReportHash != newReportHash) {
        console.log(`# Old checksum and new checksum missmatch (${prevReportHash} vs ${newReportHash}).`)
        console.log(`# Sending an email...`)
        await sendEmail(emailTo, 'Reporte de Funkos', html)
        return
    }
    console.log(`# Old checksum and new checksum are identical (${prevReportHash})...`)
}

module.exports.run = run
