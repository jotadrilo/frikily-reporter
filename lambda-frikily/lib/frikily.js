const AWS = require('aws-sdk');
const fs = require('fs');
const axios = require('axios')
const checksum = require('checksum')
const cheerio = require('cheerio')
const tableify = require('tableify')

AWS.config.update({region: 'eu-west-2'})
const ses = new AWS.SES({apiVersion: '2010-12-01'})
const s3 = new AWS.S3()

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
    const inStockStr = $('div[class="summary entry-summary"]')
        .first().find('p[class="en-stock"]')
        .first().text().trim();
    const lastStock = getLastStock($);
    return inStockStr.match(/^En stock\s*$/) != null || lastStock !== ''
}

function getLastStock($) {
    const lastStockStr = $('div[class="summary entry-summary"]')
        .first().find('p[class="ultimo-pedido"]')
        .first().text().trim();
    return lastStockStr.match(/^Queda.*/) != null
        ? lastStockStr.match(/^Queda.*/)
        : ''
}

async function processUrl(url, who) {
    // Fetch HTML of the page we want to scrape
    const {data} = await axios.get(url)
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
    const applicants = [];
    const owners = Object.keys(catalogs);
    for (const owner of owners) {
        const catalog = catalogs[owner];
        if (catalog.includes(url)) {
            applicants.push(owner)
        }
    }
    if (applicants.length === 1) {
        return applicants[0]
    }
    return applicants.slice(0, applicants.length - 1).join(', ') + ` y ${applicants[applicants.length - 1]}`
}

function getBooleanEmoji(v) {
    return v ? TRUE_EMOJI : FALSE_EMOJI
}

async function generateReport(catalogs) {
    // Generate unique URLs list
    const urls = Array.from(new Set(Object.values(catalogs).flat()));

    // Process URLs to collect information
    console.log('# Processing URLs...')
    const data = [];
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
    const htmlData = [];
    for (const product of data) {
        if (product.inStock || product.nextStock !== '') {
            // Find differences of some fields
            const matches = prevData.filter(p => p.funko === product.funko)
            const isNew = matches.length === 0
            let prevPrice = '';
            let prevNextStock = ''
            let prevInStock = false
            let prevLastItems = ''
            if (!isNew) {
                try {
                    const p = matches[0]
                    prevPrice = getPriceStr(p.prices)
                    prevNextStock = p.nextStock
                    prevInStock = p.inStock
                    prevLastItems = p.lastItems
                } catch {
                }
            }

            const funko = `<a href="${product.url}">${product.funko}</a>`;
            const curAvail = product.lastItems !== ''
                ? `${DANGER_EMOJI} ${product.lastItems}`
                : getBooleanEmoji(product.inStock);
            const curStock = product.nextStock !== ''
                ? `${CALENDAR_EMOJI} ${product.nextStock}`
                : curAvail;
            const prevAvail = prevLastItems !== ''
                ? `${DANGER_EMOJI} ${prevLastItems}`
                : getBooleanEmoji(prevInStock);
            const prevStock = prevNextStock !== ''
                ? `${CALENDAR_EMOJI} ${prevNextStock}`
                : prevAvail;
            const stock = curStock !== prevStock
                ? `${curStock} (Prev: ${prevStock})`
                : curStock;
            const price = getPriceStr(product.prices);
            const priceStr = price !== prevPrice
                ? `${price} (Prev: ${prevPrice})`
                : price;

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

    // Render table
    const table = tableify(htmlData)

    const css = `
a {
    color: #292929;
    font-weight: bold;
    text-decoration: none;
}

table {
    font-family: 'Open Sans', sans-serif;
    font-size: 12px;
    border-spacing: 0;
}
thead {
    background: #f2f2f2;
}
tr {
    text-align: center;
}
th {
    padding: 15px 5px 15px 5px;
}
td {
    padding: 5px 10px 5px 10px;
}
`
    return `<!DOCTYPE html>
<html lang="es">
<head>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans&display=swap" rel="stylesheet">
<style>
${css}
</style>
<title>Reporte</title>
</head>
<body>
${table}
</body>
</html>`
}

async function upload(name, dir, body) {
    if (process.env.SKIP_UPLOAD && process.env.SKIP_UPLOAD === '1') {
        return
    }
    await s3.upload({Bucket: dir, Key: name, Body: body}).promise()
}

async function download(name, dir, callback) {
    await s3.getObject({Bucket: dir, Key: name}).promise().then(callback)
}

async function sendEmail(emailTo, subject, html) {
    const params = {
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
    };

    // Send email
    await ses.sendEmail(params).promise()
}

async function run(catalogs, storage, emailTo) {
    // Generate report
    const report = await generateReport(catalogs)

    // Download and compute the previous report.
    // This is helpful to identify if the data has changed by checking
    // the checksum, and compute the differences.
    let prevReportStr = '[]';
    let prevReportHash = '';
    await download(REPORT_JSON_NAME, storage.bucket, (data) => {
        prevReportStr = data.Body.toString('utf-8')
        prevReportHash = checksum(prevReportStr)
    })

    // Generate and upload the HTML report
    const html = await generateHtml(report, JSON.parse(prevReportStr))
    if (process.env.WRITE_HTML_TO_DISK && process.env.WRITE_HTML_TO_DISK === '1') {
        await fs.writeFileSync('./index.html', html)
    }
    await upload(REPORT_HTML_NAME, storage.bucket, html)

    // Compute and upload the new report hash
    const reportStr = JSON.stringify(report, null, 2);
    const newReportHash = checksum(reportStr);
    await upload(REPORT_JSON_NAME, storage.bucket, reportStr)

    const hashChanged = prevReportHash !== newReportHash
    if (hashChanged) {
        console.log(`# Old checksum and new checksum mismatch (${prevReportHash} vs ${newReportHash}).`)
    } else {
        console.log(`# Old checksum and new checksum are identical (${prevReportHash})...`)
    }

    // Send an email if the new and previous reports differ or it was forced
    if (hashChanged || (process.env.FORCE_SEND_EMAIL && process.env.FORCE_SEND_EMAIL === '1')) {
        console.log(`# Sending an email...`)
        await sendEmail(emailTo, 'Reporte de Funkos', html)
    }
}

module.exports.run = run
