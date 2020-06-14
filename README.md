# Airline Price Getter

Dashboard to monitor and receive alerts for changes in airlines fare prices.

## Installation

Change the values in config.json to indicate your selections, then:

```bash
npm ci
./run.sh
```

## Usage

It will scrape the airline indicated by `config.baseUrl` fares every `INTERVAL` minutes.  It'll log if the price delta between runs is bigger than threshold.

### Development

```bash
tsc -w
```

```bash
npm run check
```
