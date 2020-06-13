export const searchSelectors = {
  originAirport: '#LandingAirBookingSearchForm_originationAirportCode' as const,
  destinationAirport: '#LandingAirBookingSearchForm_destinationAirportCode' as const,
  departureDate: '#LandingAirBookingSearchForm_departureDate' as const,
  returnDate: '#LandingAirBookingSearchForm_returnDate' as const,
  searchSubmit: '#LandingAirBookingSearchForm_submit-button' as const,
  passengerCount: '#LandingAirBookingSearchForm_adultPassengersCount' as const
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
