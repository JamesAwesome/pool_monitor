import { InfluxDB } from '@influxdata/influxdb-client'

const url = process.env.INFLUXDB_URL ?? 'http://localhost:8086'
const token = process.env.INFLUXDB_TOKEN ?? ''
const org = process.env.INFLUXDB_ORG ?? ''
const bucket = process.env.INFLUXDB_BUCKET ?? ''

const client = new InfluxDB({ url, token })

export function getQueryApi() {
  return client.getQueryApi(org)
}

function fluxQuery(range: string, field: string, aggregation: string, yieldName: string, sensorId?: string): string {
  const sensorFilter = sensorId ? `\n      |> filter(fn: (r) => r.id == "${sensorId}")` : ''
  return `
    from(bucket: "${bucket}")
      |> range(start: -${range})
      |> filter(fn: (r) => r._field == "${field}")${sensorFilter}
      |> group(columns: ["id"])
      |> ${aggregation}
      |> yield(name: "${yieldName}")
  `
}

function fluxQueryAbsolute(start: string, field: string, aggregation: string, yieldName: string, sensorId?: string): string {
  const sensorFilter = sensorId ? `\n      |> filter(fn: (r) => r.id == "${sensorId}")` : ''
  return `
    from(bucket: "${bucket}")
      |> range(start: ${start})
      |> filter(fn: (r) => r._field == "${field}")${sensorFilter}
      |> group(columns: ["id"])
      |> ${aggregation}
      |> yield(name: "${yieldName}")
  `
}

interface StatRow {
  _value: number
}

export async function querySensors(): Promise<Array<{ id: string; model: string }>> {
  const api = getQueryApi()
  const query = `
    from(bucket: "${bucket}")
      |> range(start: -24h)
      |> filter(fn: (r) => r._field == "temperature_C")
      |> keep(columns: ["id", "model"])
      |> distinct(column: "id")
  `
  const rows = await api.collectRows<{ id: string; model: string }>(query)
  return rows.map((r) => ({ id: r.id, model: r.model }))
}

export async function queryStats(sensorId?: string, range = '24h'): Promise<{
  current: number | null
  average: number | null
  peak: number | null
  seasonAvg: number | null
  seasonPeak: number | null
}> {
  const api = getQueryApi()

  const queries = {
    current: fluxQuery('24h', 'temperature_C', 'last()', 'current', sensorId),
    average: fluxQuery(range, 'temperature_C', 'mean()', 'average', sensorId),
    peak: fluxQuery(range, 'temperature_C', 'max()', 'peak', sensorId),
    seasonAvg: fluxQueryAbsolute(`${new Date().getFullYear()}-01-01T00:00:00Z`, 'temperature_C', 'mean()', 'seasonAvg', sensorId),
    seasonPeak: fluxQueryAbsolute(`${new Date().getFullYear()}-01-01T00:00:00Z`, 'temperature_C', 'max()', 'seasonPeak', sensorId),
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
  if (unit === 'd' && value <= 30) return '2h'
  return '12h'
}

interface HistoryRow {
  _time: string
  _value: number
}

export async function queryHistory(range: string, sensorId?: string): Promise<Array<{ time: string; value: number }>> {
  const api = getQueryApi()
  const period = windowPeriod(range)
  const sensorFilter = sensorId ? `\n      |> filter(fn: (r) => r.id == "${sensorId}")` : ''

  const query = `
    from(bucket: "${bucket}")
      |> range(start: -${range})
      |> filter(fn: (r) => r._field == "temperature_C")${sensorFilter}
      |> group(columns: ["id"])
      |> aggregateWindow(every: ${period}, fn: mean, createEmpty: false)
      |> yield(name: "history")
  `

  const rows = await api.collectRows<HistoryRow>(query)
  return rows.map((r) => ({ time: r._time, value: r._value }))
}

interface BatteryRow {
  id: string
  model: string
  _value: number
}

export async function queryBatteries(sensorId?: string): Promise<
  Array<{ id: string; model: string; current: number | null }>
> {
  const api = getQueryApi()
  const sensorFilter = sensorId ? `\n      |> filter(fn: (r) => r.id == "${sensorId}")` : ''

  const query = `
    from(bucket: "${bucket}")
      |> range(start: -24h)
      |> filter(fn: (r) => r._field == "battery_ok")${sensorFilter}
      |> group(columns: ["id"])
      |> last()
      |> yield(name: "current")
  `

  const rows = await api.collectRows<BatteryRow>(query)
  return rows.map((r) => ({
    id: r.id,
    model: r.model,
    current: r._value * 100,
  }))
}

export async function querySeasonHistory(sensorId?: string): Promise<
  Array<{ year: number; average: number | null; peak: number | null }>
> {
  const api = getQueryApi()
  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear - 1, currentYear - 2]
  const sensorFilter = sensorId ? `\n      |> filter(fn: (r) => r.id == "${sensorId}")` : ''

  const results = await Promise.all(
    years.map(async (year) => {
      const start = `${year}-01-01T00:00:00Z`
      const stop = `${year + 1}-01-01T00:00:00Z`

      const avgQuery = `
        from(bucket: "${bucket}")
          |> range(start: ${start}, stop: ${stop})
          |> filter(fn: (r) => r._field == "temperature_C")${sensorFilter}
          |> group(columns: ["id"])
          |> mean()
          |> yield(name: "avg")
      `
      const peakQuery = `
        from(bucket: "${bucket}")
          |> range(start: ${start}, stop: ${stop})
          |> filter(fn: (r) => r._field == "temperature_C")${sensorFilter}
          |> group(columns: ["id"])
          |> max()
          |> yield(name: "peak")
      `

      const [avgRows, peakRows] = await Promise.all([
        api.collectRows<{ _value: number }>(avgQuery),
        api.collectRows<{ _value: number }>(peakQuery),
      ])

      return {
        year,
        average: avgRows.length > 0 ? avgRows[0]._value : null,
        peak: peakRows.length > 0 ? peakRows[0]._value : null,
      }
    })
  )

  return results
}

export async function queryBatteryHistory(sensorId: string): Promise<Array<{ time: string; value: number }>> {
  const api = getQueryApi()

  // Use a broad window (6h) so sparse battery reports still show up
  const query = `
    from(bucket: "${bucket}")
      |> range(start: -30d)
      |> filter(fn: (r) => r._field == "battery_ok")
      |> filter(fn: (r) => r.id == "${sensorId}")
      |> group(columns: ["id"])
      |> aggregateWindow(every: 6h, fn: last, createEmpty: false)
      |> yield(name: "history")
  `

  const rows = await api.collectRows<{ _time: string; _value: number }>(query)
  return rows.map((r) => ({ time: r._time, value: r._value * 100 }))
}
