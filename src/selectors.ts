export const searchSelectors = {
  originAirport: '#LandingAirBookingSearchForm_originationAirportCode',
  destinationAirport: '#LandingAirBookingSearchForm_destinationAirportCode',
  departureDate: '#LandingAirBookingSearchForm_departureDate',
  returnDate: '#LandingAirBookingSearchForm_returnDate',
  searchSubmit: '#LandingAirBookingSearchForm_submit-button'
}
export const fareSelectors = {
  departureFlights: '#air-booking-product-0 .air-booking-select-detail',
  returnFlights: '#air-booking-product-0 .air-booking-select-detail',
}

export const flightSelectors = {
  flightNumber: '.actionable.actionable_button.actionable_light.button.flight-numbers--flight-number',
  farePrice: '.currency--symbol + span'
}

export const fareRowSelector = (rowNum: number): string => {
  return `#air-booking-fares-0-${rowNum}`;
}
