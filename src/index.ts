import playwright from 'playwright';
import chalk from 'chalk';
import rainbow from 'chalk-rainbow';
import twilio from 'twilio';
import blessed from 'blessed';
import contrib from 'blessed-contrib';
import format from 'date-format';
import pretty from 'pretty-ms';
import airports from 'airports';
import config from '../config/config.json';
import {dashboard} from './screen';
import {searchSelectors, fareSelectors} from './selectors';
import { TIME_MIN } from './constants';

// Fares
var prevLowestOutboundFare: number;
var prevLowestReturnFare: number;
const fares:{outbound:number[],return:number[]} = {
  outbound: [],
  return: []
}

// Command line options
var originAirport: string;
var destinationAirport: string;
var outboundDateString: string;
var returnDateString: string;
var adultPassengerCount: string;
var dealPriceThreshold: number;
var interval = 30 // In minutes

// Parse command line options (no validation, sorry!)
process.argv.forEach((arg, i, argv) => {
  switch (arg) {
    case "--from":
      originAirport = argv[i + 1]
      break
    case "--to":
      destinationAirport = argv[i + 1]
      break
    case "--leave-date":
      outboundDateString = argv[i + 1]
      break
    case "--return-date":
      returnDateString = argv[i + 1]
      break
    case "--passengers":
      adultPassengerCount = argv[i + 1]
      break
    case "--deal-price-threshold":
      dealPriceThreshold = parseInt(argv[i + 1])
      break
    case "--interval":
      interval = parseFloat(argv[i + 1])
      break
  }
})

// Check if Twilio env vars are set
const isTwilioConfigured = process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_PHONE_FROM &&
  process.env.TWILIO_PHONE_TO



/**
 * Send a text message using Twilio
 *
 * @param {Str} message
 *
 * @return {Void}
 */
const sendTextMessage = (message) => {
  try {
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

    twilioClient.sendMessage({
      from: process.env.TWILIO_PHONE_FROM,
      to: process.env.TWILIO_PHONE_TO,
      body: message
    }, function (err, data) {
      if (!dashboard) return
      if (err) {
        dashboard.log([
          chalk.red(`Error: failed to send SMS to ${process.env.TWILIO_PHONE_TO} from ${process.env.TWILIO_PHONE_FROM}`)
        ])
      } else {
        dashboard.log([
          chalk.green(`Successfully sent SMS to ${process.env.TWILIO_PHONE_TO} from ${process.env.TWILIO_PHONE_FROM}`)
        ])
      }
    })
  } catch (e) { }
}

/**
 * Fetch latest airline prices
 *
 * @return {Void}
 */
const fetch = async () => {
  const browser = await playwright.chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(config.baseUrl);

  const originAirportElem = await page.$(searchSelectors.originAirport);
  const destinationAirportElem = await page.$(searchSelectors.destinationAirport);
  const deparureDateElem = await page.$(searchSelectors.deparureDate);
  const returnDateElem = await page.$(searchSelectors.returnDate);

  if(!originAirportElem || !destinationAirportElem || !deparureDateElem || !returnDateElem){
    throw new Error('Selector drift, cannot continue');
  }
  // apply config
  await originAirportElem.fill(config.originAirport);
  await destinationAirportElem.fill(config.destinationAirport);
  await deparureDateElem.fill(config.departureDateString);
  await returnDateElem.fill(config.returnDateString);

  // submit the search
  await page.click(searchSelectors.searchSubmit);
  await page.waitForNavigation();

  const firstFare = await page.$(fareSelectors.firstOutboundFare);
  if(firstFare){
    const firstFarePrice = await firstFare.$('.currency--symbol + span');
    if(firstFarePrice){
      console.log(await firstFarePrice.innerText());
    }
  }

    //   console.log("b", priceMarkup)
    //   const matches = priceMarkup.toString().match(/\$.*?(\d+)/)
    //   const price = parseInt(matches[1])
    //   // @ts-ignore
    //   fares.outbound.push(price)
    // })
    // .find("#faresReturn .product_price")
    // .then((priceMarkup) => {
    //   const matches = priceMarkup.toString().match(/\$.*?(\d+)/)
    //   const price = parseInt(matches[1])
    //   // @ts-ignore
    //   fares.return.push(price)
    // })
    // .done((a) => {
    //   const lowestOutboundFare = Math.min(...fares.outbound)
    //   const lowestReturnFare = Math.min(...fares.return)
    //   var faresAreValid = true

    //   // Clear previous fares
    //   fares.outbound = []
    //   fares.return = []

    //   // Get difference from previous fares
    //   const outboundFareDiff = prevLowestOutboundFare - lowestOutboundFare
    //   const returnFareDiff = prevLowestReturnFare - lowestReturnFare
    //   var outboundFareDiffString = ""
    //   var returnFareDiffString = ""

    //   // Create a string to show the difference
    //   if (!isNaN(outboundFareDiff) && !isNaN(returnFareDiff)) {

    //     // Usually this is because of a scraping error
    //     if (!isFinite(outboundFareDiff) || !isFinite(returnFareDiff)) {
    //       faresAreValid = false
    //     }

    //     if (outboundFareDiff > 0) {
    //       outboundFareDiffString = chalk.green(`(down \$${Math.abs(outboundFareDiff)})`)
    //     } else if (outboundFareDiff < 0) {
    //       outboundFareDiffString = chalk.red(`(up \$${Math.abs(outboundFareDiff)})`)
    //     } else if (outboundFareDiff === 0) {
    //       outboundFareDiffString = chalk.blue(`(no change)`)
    //     }

    //     if (returnFareDiff > 0) {
    //       returnFareDiffString = chalk.green(`(down \$${Math.abs(returnFareDiff)})`)
    //     } else if (returnFareDiff < 0) {
    //       returnFareDiffString = chalk.red(`(up \$${Math.abs(returnFareDiff)})`)
    //     } else if (returnFareDiff === 0) {
    //       returnFareDiffString = chalk.blue(`(no change)`)
    //     }
    //   }

    //   if (faresAreValid) {

    //     // Store current fares for next time
    //     prevLowestOutboundFare = lowestOutboundFare
    //     prevLowestReturnFare = lowestReturnFare

    //     // Do some Twilio magic (SMS alerts for awesome deals)
    //     if (dealPriceThreshold && (lowestOutboundFare <= dealPriceThreshold || lowestReturnFare <= dealPriceThreshold)) {
    //       const message = `Deal alert! Lowest fair has hit \$${lowestOutboundFare} (outbound) and \$${lowestReturnFare} (return)`

    //       // Party time
    //       // dashboard.log([
    //       //   rainbow(message)
    //       // ])

    //       // if (isTwilioConfigured) {
    //       //   sendTextMessage(message)
    //       // }
    //     }

    //     // dashboard.log([
    //     //   `Lowest fair for an outbound flight is currently \$${[lowestOutboundFare, outboundFareDiffString].filter(i => i).join(" ")}`,
    //     //   `Lowest fair for a return flight is currently \$${[lowestReturnFare, returnFareDiffString].filter(i => i).join(" ")}`
    //     // ])

    //     // dashboard.plot({
    //     //   outbound: lowestOutboundFare,
    //     //   return: lowestReturnFare
    //     // })
    //   }

    //   //dashboard.render()

    //   setTimeout(fetch, interval * TIME_MIN)
    // })
}

// Get lat/lon for airports (no validation on non-existent airports)
airports.forEach((airport) => {
  switch (airport.iata) {
    case originAirport:
      dashboard.waypoint({ lat: airport.lat, lon: airport.lon, color: "red", char: "X" })
      break
    case destinationAirport:
      dashboard.waypoint({ lat: airport.lat, lon: airport.lon, color: "yellow", char: "X" })
      break
  }
})

// Print settings
dashboard.settings([
  //@ts-ignore
  `Origin airport: ${originAirport}`,
  //@ts-ignore
  `Destination airport: ${destinationAirport}`,
  //@ts-ignore
  `Outbound date: ${outboundDateString}`,
  //@ts-ignore
  `Return date: ${returnDateString}`,
  //@ts-ignore
  `Passengers: ${adultPassengerCount}`,
  `Interval: ${pretty(interval * TIME_MIN)}`,
  //@ts-ignore
  `Deal price: ${dealPriceThreshold ? `<= \$${dealPriceThreshold}` : "disabled"}`,
  `SMS alerts: ${isTwilioConfigured ? process.env.TWILIO_PHONE_TO : "disabled"}`
])

fetch()
