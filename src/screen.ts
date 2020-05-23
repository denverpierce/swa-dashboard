import blessed from 'blessed';
import contrib from 'blessed-contrib';
import format from 'date-format';
import { TIME_SEC } from './constants';


/**
 * Dashboard renderer
 */
class Dashboard {
  markers: any[];
  widgets: object;
  screen: any;
  grid: any;
  graph: any;
  graphs: any;

  constructor() {
    this.markers = []
    this.widgets = {}

    // Configure blessed
    this.screen = blessed.screen({
      title: "SWA Dashboard",
      autoPadding: true,
      dockBorders: true,
      fullUnicode: true,
      smartCSR: true
    })

    this.screen.key(["escape", "q", "C-c"], (ch, key) => process.exit(0))

    // Grid settings
    this.grid = new contrib.grid({
      screen: this.screen,
      rows: 12,
      cols: 12
    })

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
      return: {
        title: "Destination/Return",
        x: [],
        y: [],
        style: {
          line: "yellow"
        }
      }
    }

    // Shared settings
    const shared = {
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
    }

    // Widgets
    const widgets = {
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
    }

    for (let name in widgets) {
      // @ts-ignore
      let widget = widgets[name]

      // @ts-ignore
      this.widgets[name] = this.grid.set(
        widget.size.top,
        widget.size.left,
        widget.size.height,
        widget.size.width,
        widget.type,
        widget.options
      )
    }
  }

  /**
   * Render screen
   *
   * @return {Void}
   */
  render() {
    console.error('made it')
    this.screen.render()
  }

  /**
   * Plot graph data
   *
   * @param {Arr} prices
   *
   * @return {Void}
   */
  plot(prices) {
    const now = format("MM/dd/yy-hh:mm:ss", new Date())

    Object.assign(this.graphs.outbound, {
      x: [...this.graphs.outbound.x, now],
      y: [...this.graphs.outbound.y, prices.outbound]
    })

    Object.assign(this.graphs.return, {
      x: [...this.graphs.return.x, now],
      y: [...this.graphs.return.y, prices.return]
    })

    // @ts-ignore
    this.widgets.graph.setData([
      this.graphs.outbound,
      this.graphs.return
    ])
  }

  /**
   * Add waypoint marker to map
   *
   * @param {Obj} data
   *
   * @return {Void}
   */
  waypoint(data) {
    this.markers.push(data)
    // @ts-ignore
    if (this.blink) {
      return
    }

    // Blink effect
    var visible = true
    // @ts-ignore
    this.blink = setInterval(() => {
      if (visible) {
        // @ts-ignore
        this.markers.forEach((m) => this.widgets.map.addMarker(m))
      } else {
        // @ts-ignore
        this.widgets.map.clearMarkers()
      }

      visible = !visible

      this.render()
    }, 1 * TIME_SEC)
  }

  /**
   * Log data
   *
   * @param {Arr} messages
   *
   * @return {Void}
   */
  log(messages) {
    const now = format("MM/dd/yy-hh:mm:ss", new Date())
    // @ts-ignore
    messages.forEach((m) => this.widgets.log.log(`${now}: ${m}`))
  }

  /**
   * Display settings
   *
   * @param {Arr} config
   *
   * @return {Void}
   */
  settings(config) {
    // @ts-ignore
    config.forEach((c) => this.widgets.settings.add(c))
  }
}

export const dashboard = new Dashboard()
