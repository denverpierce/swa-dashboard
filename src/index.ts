import playwright from 'playwright';
import config from '../config/config.json';
import { searchSelectors, fareSelectors, flightSelectors } from './selectors';
import * as io from 'io-ts';
import { Either, fold } from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/pipeable';

type Flight = {
  number: string,
  price: number,
  fetchTime: string
}

// Fares
let prevLowestOutboundFare: number = 999999;
let prevLowestReturnFare: number = 999999;

const fares: {
  cheapestOriginFlights: Flight[],
  cheapestDestinationFlights: Flight[]
} = {
  cheapestOriginFlights: [],
  cheapestDestinationFlights: []
};

const ioApiData = io.partial({
  notfications: io.partial({
    formErrors: io.array(io.partial({
      code: io.string
    }))
  })
})

// Command line options
const DEAL_PRICE_THRESHOLD = 30; // price in dollars
const INTERVAL = 120; // will be converted to minutes

/**
 * Fetch latest airline prices
 *
 * @return {Void}
 */
const fetchCurrentPrices = async (): Promise<typeof fares> => {
  // const browser = await playwright.firefox.launchPersistentContext('/tmp/playwright', { headless: false });
  const browser = await playwright.firefox.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(config.baseUrl, { timeout: 5000 });

  // need to wait until we see the codes
  await page.waitForSelector(searchSelectors.originAirport);
  const originAirportElem = await page.$(searchSelectors.originAirport);
  const destinationAirportElem = await page.$(searchSelectors.destinationAirport);
  const deparureDateElem = await page.$(searchSelectors.departureDate);
  const returnDateElem = await page.$(searchSelectors.returnDate);

  if (!originAirportElem || !destinationAirportElem || !deparureDateElem || !returnDateElem) {
    console.error('Couldn\'t find entry elems')
    throw new Error('Couldn\'t find entry elems')
  }

  // apply config
  await originAirportElem.fill(config.originAirport);
  await destinationAirportElem.fill(config.destinationAirport);
  await deparureDateElem.fill(config.departureDateString);
  await returnDateElem.fill(config.returnDateString);

  // the date picker obscures the submit button, so need to send some keys
  // to dismiss it
  await returnDateElem.press('Tab');
  await (await page.$(searchSelectors.passengerCount))!.press('Tab');

  // navigate and wait for results to display
  let [_1, _2, _3] = await Promise.all([
    //page.waitForResponse(/shopping$/, { timeout: 7000 }),
    page.waitForNavigation(), // The promise resolves after navigation has finished
    page.click(searchSelectors.searchSubmit), // Clicking the link will indirectly cause a navigation
    page.waitForSelector('.air-booking-select-detail')
  ]).catch(() => {
    return [null, null, null];
  });

  const results = await page.$('.search-results--messages');
  const flightSorter = (l: Flight, r: Flight) => Number(l.price > r.price);

  const flightRowProcessor = async (flight: typeof results): Promise<Flight> => {
    if (!flight) { throw new Error('Null elems shouldnt be here'); }
    const number = await (await flight.$(flightSelectors.flightNumber));
    const farePrice = await (await flight.$(flightSelectors.farePrice));

    if (!number || !farePrice) {
      throw new Error('Null elems shouldnt be here');
    }

    return {
      number: (await number.innerText())!,
      price: parseFloat(await (await farePrice.innerText())!),
      fetchTime: new Date().toISOString()
    }
  }

  const departureFlightsPromise = (await page.$$(fareSelectors.departureFlights))
    .filter((f) => f != null)
    .map((flightRowProcessor));

  const returnFlightsPromise = (await page.$$(fareSelectors.returnFlights))
    .filter((f) => f != null)
    .map(flightRowProcessor);

  const returnFlights = (await Promise.all(returnFlightsPromise)).sort(flightSorter);
  const departureFlights = (await Promise.all(departureFlightsPromise)).sort(flightSorter);

  await browser.close();

  if (returnFlights.length === 0 || departureFlights.length === 0) {
    return fares;
  }

  const currentCheapestDeparture = departureFlights[0];
  const currentCheapestReturn = returnFlights[0];

  fares.cheapestOriginFlights.push(currentCheapestDeparture);
  fares.cheapestDestinationFlights.push(currentCheapestReturn);

  // Store current fares for next time
  if (prevLowestOutboundFare - currentCheapestDeparture.price >= DEAL_PRICE_THRESHOLD) {
    prevLowestOutboundFare = currentCheapestDeparture.price
  }
  if (prevLowestReturnFare - currentCheapestReturn.price >= DEAL_PRICE_THRESHOLD) {
    prevLowestReturnFare = currentCheapestReturn.price;
  }

  console.log(JSON.stringify(fares))
  return fares;
}

const fail = (reason: any) => {
  console.error(reason);
  throw new Error(reason);
}

// fire it once before letting interval take over
fetchCurrentPrices()
  .catch(fail);

setInterval(() => {
  fetchCurrentPrices()
    .catch(fail);
}, (60 * 1000 * INTERVAL))
