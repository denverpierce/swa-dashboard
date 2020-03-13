#!/usr/bin/env node
"use strict";
var osmosis = require("osmosis");
var chalk = require("chalk");
var rainbow = require("chalk-rainbow");
var twilio = require("twilio");
var blessed = require("blessed");
var contrib = require("blessed-contrib");
var format = require("date-format");
var pretty = require("pretty-ms");
var airports = require("airports");
// Time constants
var TIME_MS = 1;
var TIME_SEC = TIME_MS * 1000;
var TIME_MIN = TIME_SEC * 60;
var TIME_HOUR = TIME_MIN * 60;
// Fares
var prevLowestOutboundFare;
var prevLowestReturnFare;
var fares = {
    outbound: [],
    "return": []
};
// Command line options
var originAirport;
var destinationAirport;
var outboundDateString;
var returnDateString;
var adultPassengerCount;
var dealPriceThreshold;
var interval = 30; // In minutes
// Parse command line options (no validation, sorry!)
process.argv.forEach(function (arg, i, argv) {
    switch (arg) {
        case "--from":
            originAirport = argv[i + 1];
            break;
        case "--to":
            destinationAirport = argv[i + 1];
            break;
        case "--leave-date":
            outboundDateString = argv[i + 1];
            break;
        case "--return-date":
            returnDateString = argv[i + 1];
            break;
        case "--passengers":
            adultPassengerCount = argv[i + 1];
            break;
        case "--deal-price-threshold":
            dealPriceThreshold = parseInt(argv[i + 1]);
            break;
        case "--interval":
            interval = parseFloat(argv[i + 1]);
            break;
    }
});
// Check if Twilio env vars are set
var isTwilioConfigured = process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_FROM &&
    process.env.TWILIO_PHONE_TO;
/**
 * Dashboard renderer
 */
var Dashboard = /** @class */ (function () {
    function Dashboard() {
        this.markers = [];
        this.widgets = {};
        // Configure blessed
        this.screen = blessed.screen({
            title: "SWA Dashboard",
            autoPadding: true,
            dockBorders: true,
            fullUnicode: true,
            smartCSR: true
        });
        this.screen.key(["escape", "q", "C-c"], function (ch, key) { return process.exit(0); });
        // Grid settings
        this.grid = new contrib.grid({
            screen: this.screen,
            rows: 12,
            cols: 12
        });
        // Graphs
        this.graphs = {
            outbound: {
                title: "Origin/Outbound",
                x: [],
                y: [],
                style: {
                    line: "red"
                }
            },
            "return": {
                title: "Destination/Return",
                x: [],
                y: [],
                style: {
                    line: "yellow"
                }
            }
        };
        // Shared settings
        var shared = {
            border: {
                type: "line"
            },
            style: {
                fg: "blue",
                text: "blue",
                border: {
                    fg: "green"
                }
            }
        };
        // Widgets
        var widgets = {
            map: {
                type: contrib.map,
                size: {
                    width: 9,
                    height: 5,
                    top: 0,
                    left: 0
                },
                options: Object.assign({}, shared, {
                    label: "Map",
                    startLon: 54,
                    endLon: 110,
                    startLat: 112,
                    endLat: 140,
                    region: "us"
                })
            },
            settings: {
                type: contrib.log,
                size: {
                    width: 3,
                    height: 5,
                    top: 0,
                    left: 9
                },
                options: Object.assign({}, shared, {
                    label: "Settings",
                    padding: {
                        left: 1
                    }
                })
            },
            graph: {
                type: contrib.line,
                size: {
                    width: 12,
                    height: 4,
                    top: 5,
                    left: 0
                },
                options: Object.assign({}, shared, {
                    label: "Prices",
                    showLegend: true,
                    legend: {
                        width: 20
                    }
                })
            },
            log: {
                type: contrib.log,
                size: {
                    width: 12,
                    height: 3,
                    top: 9,
                    left: 0
                },
                options: Object.assign({}, shared, {
                    label: "Log",
                    padding: {
                        left: 1
                    }
                })
            }
        };
        for (var name in widgets) {
            var widget = widgets[name];
            this.widgets[name] = this.grid.set(widget.size.top, widget.size.left, widget.size.height, widget.size.width, widget.type, widget.options);
        }
    }
    /**
     * Render screen
     *
     * @return {Void}
     */
    Dashboard.prototype.render = function () {
        this.screen.render();
    };
    /**
     * Plot graph data
     *
     * @param {Arr} prices
     *
     * @return {Void}
     */
    Dashboard.prototype.plot = function (prices) {
        var now = format("MM/dd/yy-hh:mm:ss", new Date());
        Object.assign(this.graphs.outbound, {
            x: this.graphs.outbound.x.concat([now]),
            y: this.graphs.outbound.y.concat([prices.outbound])
        });
        Object.assign(this.graphs["return"], {
            x: this.graphs["return"].x.concat([now]),
            y: this.graphs["return"].y.concat([prices["return"]])
        });
        this.widgets.graph.setData([
            this.graphs.outbound,
            this.graphs["return"]
        ]);
    };
    /**
     * Add waypoint marker to map
     *
     * @param {Obj} data
     *
     * @return {Void}
     */
    Dashboard.prototype.waypoint = function (data) {
        var _this = this;
        this.markers.push(data);
        if (this.blink) {
            return;
        }
        // Blink effect
        var visible = true;
        this.blink = setInterval(function () {
            if (visible) {
                _this.markers.forEach(function (m) { return _this.widgets.map.addMarker(m); });
            }
            else {
                _this.widgets.map.clearMarkers();
            }
            visible = !visible;
            _this.render();
        }, 1 * TIME_SEC);
    };
    /**
     * Log data
     *
     * @param {Arr} messages
     *
     * @return {Void}
     */
    Dashboard.prototype.log = function (messages) {
        var _this = this;
        var now = format("MM/dd/yy-hh:mm:ss", new Date());
        messages.forEach(function (m) { return _this.widgets.log.log(now + ": " + m); });
    };
    /**
     * Display settings
     *
     * @param {Arr} config
     *
     * @return {Void}
     */
    Dashboard.prototype.settings = function (config) {
        var _this = this;
        config.forEach(function (c) { return _this.widgets.settings.add(c); });
    };
    return Dashboard;
}());
var dashboard = new Dashboard();
/**
 * Send a text message using Twilio
 *
 * @param {Str} message
 *
 * @return {Void}
 */
var sendTextMessage = function (message) {
    try {
        var twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        twilioClient.sendMessage({
            from: process.env.TWILIO_PHONE_FROM,
            to: process.env.TWILIO_PHONE_TO,
            body: message
        }, function (err, data) {
            if (!dashboard)
                return;
            if (err) {
                dashboard.log([
                    chalk.red("Error: failed to send SMS to " + process.env.TWILIO_PHONE_TO + " from " + process.env.TWILIO_PHONE_FROM)
                ]);
            }
            else {
                dashboard.log([
                    chalk.green("Successfully sent SMS to " + process.env.TWILIO_PHONE_TO + " from " + process.env.TWILIO_PHONE_FROM)
                ]);
            }
        });
    }
    catch (e) { }
};
/**
 * Fetch latest Southwest prices
 *
 * @return {Void}
 */
var fetch = function () {
    console.log(ttt);
    var ttt = osmosis
        .get("https://www.southwest.com")
        .submit(".booking-form--form", {
        twoWayTrip: true,
        airTranRedirect: "",
        returnAirport: "RoundTrip",
        outboundTimeOfDay: "ANYTIME",
        returnTimeOfDay: "ANYTIME",
        seniorPassengerCount: 0,
        fareType: "DOLLARS",
        originAirport: originAirport,
        destinationAirport: destinationAirport,
        outboundDateString: outboundDateString,
        returnDateString: returnDateString,
        adultPassengerCount: adultPassengerCount
    })
        .find("#faresOutbound .product_price")
        .then(function (priceMarkup) {
        var matches = priceMarkup.toString().match(/\$.*?(\d+)/);
        var price = parseInt(matches[1]);
        fares.outbound.push(price);
    })
        .find("#faresReturn .product_price")
        .then(function (priceMarkup) {
        var matches = priceMarkup.toString().match(/\$.*?(\d+)/);
        var price = parseInt(matches[1]);
        fares["return"].push(price);
    })
        .done(function () {
        var lowestOutboundFare = Math.min.apply(Math, fares.outbound);
        var lowestReturnFare = Math.min.apply(Math, fares["return"]);
        var faresAreValid = true;
        // Clear previous fares
        fares.outbound = [];
        fares["return"] = [];
        // Get difference from previous fares
        var outboundFareDiff = prevLowestOutboundFare - lowestOutboundFare;
        var returnFareDiff = prevLowestReturnFare - lowestReturnFare;
        var outboundFareDiffString = "";
        var returnFareDiffString = "";
        // Create a string to show the difference
        if (!isNaN(outboundFareDiff) && !isNaN(returnFareDiff)) {
            // Usually this is because of a scraping error
            if (!isFinite(outboundFareDiff) || !isFinite(returnFareDiff)) {
                faresAreValid = false;
            }
            if (outboundFareDiff > 0) {
                outboundFareDiffString = chalk.green("(down $" + Math.abs(outboundFareDiff) + ")");
            }
            else if (outboundFareDiff < 0) {
                outboundFareDiffString = chalk.red("(up $" + Math.abs(outboundFareDiff) + ")");
            }
            else if (outboundFareDiff === 0) {
                outboundFareDiffString = chalk.blue("(no change)");
            }
            if (returnFareDiff > 0) {
                returnFareDiffString = chalk.green("(down $" + Math.abs(returnFareDiff) + ")");
            }
            else if (returnFareDiff < 0) {
                returnFareDiffString = chalk.red("(up $" + Math.abs(returnFareDiff) + ")");
            }
            else if (returnFareDiff === 0) {
                returnFareDiffString = chalk.blue("(no change)");
            }
        }
        if (faresAreValid) {
            // Store current fares for next time
            prevLowestOutboundFare = lowestOutboundFare;
            prevLowestReturnFare = lowestReturnFare;
            // Do some Twilio magic (SMS alerts for awesome deals)
            if (dealPriceThreshold && (lowestOutboundFare <= dealPriceThreshold || lowestReturnFare <= dealPriceThreshold)) {
                var message = "Deal alert! Lowest fair has hit $" + lowestOutboundFare + " (outbound) and $" + lowestReturnFare + " (return)";
                // Party time
                dashboard.log([
                    rainbow(message)
                ]);
                if (isTwilioConfigured) {
                    sendTextMessage(message);
                }
            }
            dashboard.log([
                "Lowest fair for an outbound flight is currently $" + [lowestOutboundFare, outboundFareDiffString].filter(function (i) { return i; }).join(" "),
                "Lowest fair for a return flight is currently $" + [lowestReturnFare, returnFareDiffString].filter(function (i) { return i; }).join(" ")
            ]);
            dashboard.plot({
                outbound: lowestOutboundFare,
                "return": lowestReturnFare
            });
        }
        dashboard.render();
        setTimeout(fetch, interval * TIME_MIN);
    });
};
// Get lat/lon for airports (no validation on non-existent airports)
airports.forEach(function (airport) {
    switch (airport.iata) {
        case originAirport:
            dashboard.waypoint({ lat: airport.lat, lon: airport.lon, color: "red", char: "X" });
            break;
        case destinationAirport:
            dashboard.waypoint({ lat: airport.lat, lon: airport.lon, color: "yellow", char: "X" });
            break;
    }
});
// Print settings
dashboard.settings([
    "Origin airport: " + originAirport,
    "Destination airport: " + destinationAirport,
    "Outbound date: " + outboundDateString,
    "Return date: " + returnDateString,
    "Passengers: " + adultPassengerCount,
    "Interval: " + pretty(interval * TIME_MIN),
    "Deal price: " + (dealPriceThreshold ? "<= $" + dealPriceThreshold : "disabled"),
    "SMS alerts: " + (isTwilioConfigured ? process.env.TWILIO_PHONE_TO : "disabled")
]);
fetch();
