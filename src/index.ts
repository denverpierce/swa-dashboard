import playwright, { Page, ElementHandle } from 'playwright';
import chalk from 'chalk';
import twilio from 'twilio';
import pretty from 'pretty-ms';
import config from '../config/config.json';
import { dashboard } from './screen';
import { searchSelectors, fareSelectors, flightSelectors } from './selectors';
import { TIME_MIN } from './constants';

// Fares
var prevLowestOutboundFare: number;
var prevLowestReturnFare: number;
const fares: { departure: number[], return: number[] } = {
  departure: [],
  return: []
}

// Command line options
var dealPriceThreshold: 50;
var interval = 30 // In minutes


const serialize = function (obj) {
  var str: string[] = [];
  for (var p in obj)
    if (obj.hasOwnProperty(p)) {
      str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
    }
  return str.join("&");
}
const TRIP_DEFAULTS = {
  int: 'HOMEQBOMAIR',
  adultPassengersCount: 1,
  fareType: 'USD',
  seniorPassengersCount: 0,
  tripType: 'roundtrip',
  departureTimeOfDay: 'ALL_DAY',
  reset: true,
  passengerType: 'ADULT',
  returnTimeOfDay: 'ALL_DAY'
};
type TripBuilder = {
  originationAirportCode: string,
  destinationAirportCode: string,
  departureDate: string,
  returnDate: string
}
const tripUrlBuilder = (trip: TripBuilder): string => {
  return serialize({
    ...TRIP_DEFAULTS,
    ...trip
  })
}

/**
 * Fetch latest airline prices
 *
 * @return {Void}
 */
const fetch = async () => {




  const browser = await playwright.firefox.launchPersistentContext('/tmp/playwright', { headless: false, devtools: false });
  const page = await browser.newPage();
  await page.goto('https://www.southwest.com/', { timeout: 5000 });

  // need to wait until we see the codes
  await page.waitForSelector(searchSelectors.originAirport)

  const originAirportElem = await page.$(searchSelectors.originAirport);
  const destinationAirportElem = await page.$(searchSelectors.destinationAirport);
  const deparureDateElem = await page.$(searchSelectors.departureDate);
  const returnDateElem = await page.$(searchSelectors.returnDate);

  if (!originAirportElem || !destinationAirportElem || !deparureDateElem || !returnDateElem) {
    process.exit()
  }
  // apply config
  await originAirportElem.fill(config.originAirport)
  await destinationAirportElem.fill(config.destinationAirport);
  await deparureDateElem.fill(config.departureDateString);
  await returnDateElem.fill(config.returnDateString);

  dashboard.settings([
    //@ts-ignore
    `Origin airport: ${config.originAirport}`,
    //@ts-ignore
    `Destination airport: ${config.destinationAirport}`,
    //@ts-ignore
    `Outbound date: ${config.outboundDateString}`,
    //@ts-ignore
    `Return date: ${config.returnDateString}`,
    //@ts-ignore
    `Passengers: ${config.adultPassengerCount}`,
    `Interval: ${pretty(interval * TIME_MIN)}`,
    //@ts-ignore
    `Deal price: ${dealPriceThreshold ? `<= \$${dealPriceThreshold}` : "disabled"}`
  ])
  //submit the search and wait
  // await page.click(searchSelectors.searchSubmit);
  // await page.waitForNavigation();
  // await page.waitForSelector('.search-results--messages');

  // navigate and wait for results to display
  const [response] = await Promise.all([
    page.waitForNavigation(), // The promise resolves after navigation has finished
    page.click(searchSelectors.searchSubmit), // Clicking the link will indirectly cause a navigation
    page.waitForSelector('.air-booking-select-detail')
  ]);
  type Flight = {
    number: string,
    wannaGetAway: number
  }

  const results = await page.$('.search-results--messages')
  if (!results) {
    console.error('No results');
    throw new Error('Couldnt find results');
  }
  const flightSorter = (l: Flight, r: Flight) => Number(l.wannaGetAway > r.wannaGetAway);

  const flightRowProcessor = async (flight: typeof results): Promise<Flight> => {
    const number = await (await flight.$(flightSelectors.flightNumber));
    const wannaGetAwayPrice = await (await flight.$(flightSelectors.farePrice));
    if (!number || !wannaGetAwayPrice) {
      console.error(await flight.innerHTML())
      throw new Error('Null elems shouldnt be here');
    }

    return {
      number: (await number.innerText())!,
      wannaGetAway: parseFloat(await (await wannaGetAwayPrice.innerText())!)
    }
  }

  const departureFlightsPromise = (await page.$$(fareSelectors.departureFlights))
    .filter((f) => f != null)
    .map((flightRowProcessor));

  const returnFlightsPromise = (await page.$$(fareSelectors.departureFlights))
    .filter((f) => f != null)
    .map(flightRowProcessor);

  const returnFlights = (await Promise.all(returnFlightsPromise)).sort(flightSorter);
  const departureFlights = (await Promise.all(departureFlightsPromise)).sort(flightSorter);

  await browser.close();

  const currentCheapestDeparture = departureFlights[0];
  const currentCheapestReturn = returnFlights[0];

  fares.departure.push(currentCheapestDeparture.wannaGetAway)
  fares.return.push(currentCheapestReturn.wannaGetAway);

  // Store current fares for next time
  const prevLowestOutboundFare = currentCheapestDeparture.wannaGetAway
  const prevLowestReturnFare = currentCheapestReturn.wannaGetAway

  const lowestOutboundFare = currentCheapestDeparture.wannaGetAway;
  const lowestReturnFare = currentCheapestReturn.wannaGetAway;

  // Do some Twilio magic (SMS alerts for awesome deals)
  //if (dealPriceThreshold && (lowestOutboundFare <= dealPriceThreshold || lowestReturnFare <= dealPriceThreshold)) {
    const message = `Deal alert! Lowest fair has hit \$${lowestOutboundFare} (outbound) and \$${lowestReturnFare} (return)`

    // Party time
    dashboard.log([
      //rainbow('good')
    ])
  //}

  dashboard.log([
    `Lowest fair for an outbound flight is currently \$${[lowestOutboundFare].filter(i => i).join(" ")}`,
    `Lowest fair for a return flight is currently \$${[lowestReturnFare].filter(i => i).join(" ")}`
  ])

  dashboard.plot({
    outbound: lowestOutboundFare,
    return: lowestReturnFare
  })
  dashboard.render()
}


// Get lat/lon for airports (no validation on non-existent airports)
// airports.forEach((airport) => {
//   switch (airport.iata) {
//     case originAirport:
//       dashboard.waypoint({ lat: airport.lat, lon: airport.lon, color: "red", char: "X" })
//       break
//     case destinationAirport:
//       dashboard.waypoint({ lat: airport.lat, lon: airport.lon, color: "yellow", char: "X" })
//       break
//   }
// })

// Print settings


fetch().catch(()=>process.exit())
