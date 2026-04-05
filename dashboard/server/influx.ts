import { InfluxDB } from '@influxdata/influxdb-client'

const url = process.env.INFLUXDB_URL ?? 'http://localhost:8086'
const token = process.env.INFLUXDB_TOKEN ?? ''
const org = process.env.INFLUXDB_ORG ?? ''
const bucket = process.env.INFLUXDB_BUCKET ?? ''

const client = new InfluxDB({ url, token })

export function getQueryApi() {
  return client.getQueryApi(org)
}

function fluxQuery(range: string, field: string, aggregation: string, yieldName: string): string {
  return `
    from(bucket: "${bucket}")
      |> range(start: -${range})
      |> filter(fn: (r) => r._field == "${field}")
      |> group(columns: ["id"])
      |> ${aggregation}
      |> yield(name: "${yieldName}")
  `
}

interface StatRow {
  _value: number
}

export async function queryStats(): Promise<{
  current: number | null
  average: number | null
  peak: number | null
  seasonAvg: number | null
  seasonPeak: number | null
}> {
  const api = getQueryApi()

  const queries = {
    current: fluxQuery('24h', 'temperature_C', 'last()', 'current'),
    average: fluxQuery('24h', 'temperature_C', 'mean()', 'average'),
    peak: fluxQuery('24h', 'temperature_C', 'max()', 'peak'),
    seasonAvg: fluxQuery('180d', 'temperature_C', 'mean()', 'seasonAvg'),
    seasonPeak: fluxQuery('180d', 'temperature_C', 'max()', 'seasonPeak'),
  }

  const results = await Promise.all(
    Object.entries(queries).map(async ([key, query]) => {
      const rows = await api.collectRows<StatRow>(query)
      const value = rows.length > 0 ? rows[0]._value : null
      return [key, value] as const
    })
  )

  return Object.fromEntries(results) as {
    current: number | null
    average: number | null
    peak: number | null
    seasonAvg: number | null
    seasonPeak: number | null
  }
}

function windowPeriod(range: string): string {
  const match = range.match(/^(\d+)([hdwm])$/)
  if (!match) return '5m'

  const value = parseInt(match[1], 10)
  const unit = match[2]

  // Pick a window period that yields ~200-300 data points
  if (unit === 'h' && value <= 12) return '5m'
  if (unit === 'h' && value <= 24) return '10m'
  if (unit === 'd' && value <= 7) return '1h'
  if (unit === 'd' && value <= 30) return '4h'
  return '12h'
}

interface HistoryRow {
  _time: string
  _value: number
}

export async function queryHistory(range: string): Promise<Array<{ time: string; value: number }>> {
  const api = getQueryApi()
  const period = windowPeriod(range)

  const query = `
    from(bucket: "${bucket}")
      |> range(start: -${range})
      |> filter(fn: (r) => r._field == "temperature_C")
      |> group(columns: ["id"])
      |> aggregateWindow(every: ${period}, fn: mean, createEmpty: false)
      |> yield(name: "history")
  `

  const rows = await api.collectRows<HistoryRow>(query)
  return rows.map((r) => ({ time: r._time, value: r._value }))
}

interface BatteryRow {
  _time: string
  _value: number
}

export async function queryBattery(): Promise<{
  current: number | null
  history: Array<{ time: string; value: number }>
}> {
  const api = getQueryApi()

  const currentQuery = `
    from(bucket: "${bucket}")
      |> range(start: -24h)
      |> filter(fn: (r) => r._field == "battery_ok")
      |> group(columns: ["id"])
      |> last()
      |> yield(name: "current")
  `

  const historyQuery = `
    from(bucket: "${bucket}")
      |> range(start: -7d)
      |> filter(fn: (r) => r._field == "battery_ok")
      |> group(columns: ["id"])
      |> aggregateWindow(every: 1h, fn: last, createEmpty: false)
      |> yield(name: "history")
  `

  const [currentRows, historyRows] = await Promise.all([
    api.collectRows<BatteryRow>(currentQuery),
    api.collectRows<BatteryRow>(historyQuery),
  ])

  return {
    current: currentRows.length > 0 ? currentRows[0]._value * 100 : null,
    history: historyRows.map((r) => ({ time: r._time, value: r._value * 100 })),
  }
}
