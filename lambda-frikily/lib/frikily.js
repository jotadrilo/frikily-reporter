const AWS = require('aws-sdk');
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

    const css = `table {
  border: 1px solid #ccc;
  border-collapse: collapse;
  margin: 0;
  padding: 0;
  width: 100%;
  table-layout: fixed;
}

table caption {
  font-size: 1.5em;
  margin: .5em 0 .75em;
}

table tr {
  background-color: #f8f8f8;
  border: 1px solid #ddd;
  padding: .35em;
}

table th,
table td {
  padding: .625em;
  text-align: center;
}

table th {
  font-size: .85em;
  letter-spacing: .1em;
  text-transform: uppercase;
}

@media screen and (max-width: 600px) {
  table {
    border: 0;
  }

  table caption {
    font-size: 1.3em;
  }

  table thead {
    border: none;
    clip: rect(0 0 0 0);
    height: 1px;
    margin: -1px;
    overflow: hidden;
    padding: 0;
    position: absolute;
    width: 1px;
  }

  table tr {
    border-bottom: 3px solid #ddd;
    display: block;
    margin-bottom: .625em;
  }

  table td {
    border-bottom: 1px solid #ddd;
    display: block;
    font-size: .8em;
    text-align: right;
  }

  table td::before {
    /*
    * aria-label has no advantage, it won't be read inside a table
    content: attr(aria-label);
    */
    content: attr(data-label);
    float: left;
    font-weight: bold;
    text-transform: uppercase;
  }

  table td:last-child {
    border-bottom: 0;
  }
}

/* general styling */
body {
  font-family: "Open Sans", sans-serif;
  line-height: 1.25;
}`
    const html = '<style>' +${css} +'</style>' + tableify(htmlData)
    console.log(html)
}

async function upload(name, dir, body) {
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
    await upload(REPORT_HTML_NAME, storage.bucket, html)

    // Compute and upload the new report hash
    const reportStr = JSON.stringify(report, null, 2);
    const newReportHash = checksum(reportStr);
    await upload(REPORT_JSON_NAME, storage.bucket, reportStr)

    // Send an email if the new and previous reports differ
    if (prevReportHash !== newReportHash) {
        console.log(`# Old checksum and new checksum missmatch (${prevReportHash} vs ${newReportHash}).`)
        console.log(`# Sending an email...`)
        await sendEmail(emailTo, 'Reporte de Funkos', html)
        return
    }
    console.log(`# Old checksum and new checksum are identical (${prevReportHash})...`)
}

module.exports.run = run
