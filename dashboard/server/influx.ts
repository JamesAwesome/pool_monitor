import { InfluxDB } from '@influxdata/influxdb-client'

const url = process.env.INFLUXDB_URL ?? 'http://localhost:8086'
const token = process.env.INFLUXDB_TOKEN ?? ''
const org = process.env.INFLUXDB_ORG ?? ''
const bucket = process.env.INFLUXDB_BUCKET ?? ''

const client = new InfluxDB({ url, token })

export function getQueryApi() {
  return client.getQueryApi(org)
}

export function parseRange(range: string): string {
  if (range.startsWith('custom:')) {
    const [, from, to] = range.split(':')
    // Use next day at midnight for inclusive stop (range is [start, stop))
    const stopDate = new Date(to)
    stopDate.setUTCDate(stopDate.getUTCDate() + 1)
    const stop = stopDate.toISOString().split('T')[0]
    return `start: ${from}T00:00:00Z, stop: ${stop}T00:00:00Z`
  }
  return `start: -${range}`
}

function fluxQuery(range: string, field: string, aggregation: string, yieldName: string, sensorId?: string): string {
  const sensorFilter = sensorId ? `\n      |> filter(fn: (r) => r.id == "${sensorId}")` : ''
  const groupClause = sensorId ? 'group(columns: ["id"])' : 'group()'
  return `
    from(bucket: "${bucket}")
      |> range(${parseRange(range)})
      |> filter(fn: (r) => r._field == "${field}")${sensorFilter}
      |> ${groupClause}
      |> ${aggregation}
      |> yield(name: "${yieldName}")
  `
}

function fluxQueryAbsolute(start: string, field: string, aggregation: string, yieldName: string, sensorId?: string): string {
  const sensorFilter = sensorId ? `\n      |> filter(fn: (r) => r.id == "${sensorId}")` : ''
  const groupClause = sensorId ? 'group(columns: ["id"])' : 'group()'
  return `
    from(bucket: "${bucket}")
      |> range(start: ${start})
      |> filter(fn: (r) => r._field == "${field}")${sensorFilter}
      |> ${groupClause}
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

export function windowPeriod(range: string): string {
  if (range.startsWith('custom:')) {
    const [, from, to] = range.split(':')
    const days = (new Date(to).getTime() - new Date(from).getTime()) / 86400000 + 1
    if (days <= 1) return '5m'
    if (days <= 3) return '30m'
    if (days <= 7) return '1h'
    if (days <= 30) return '2h'
    return '6h'
  }

  const match = range.match(/^(\d+)([hdwm])$/)
  if (!match) return '5m'

  const value = parseInt(match[1], 10)
  const unit = match[2]

  if (unit === 'h' && value <= 12) return '5m'
  if (unit === 'h' && value <= 24) return '5m'
  if (unit === 'd' && value <= 3) return '30m'
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
  // When no sensor selected, group() aggregates across all sensors into one line
  const groupClause = sensorId ? 'group(columns: ["id"])' : 'group()'

  const query = `
    from(bucket: "${bucket}")
      |> range(${parseRange(range)})
      |> filter(fn: (r) => r._field == "temperature_C")${sensorFilter}
      |> ${groupClause}
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
  Array<{ year: number; average: number | null; peak: number | null; low: number | null }>
> {
  const api = getQueryApi()
  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear - 1, currentYear - 2]
  const sensorFilter = sensorId ? `\n      |> filter(fn: (r) => r.id == "${sensorId}")` : ''
  const groupClause = sensorId ? 'group(columns: ["id"])' : 'group()'

  const results = await Promise.all(
    years.map(async (year) => {
      const start = `${year}-01-01T00:00:00Z`
      const stop = `${year + 1}-01-01T00:00:00Z`

      // Combine avg and peak into one query per year
      const query = `
        base = from(bucket: "${bucket}")
          |> range(start: ${start}, stop: ${stop})
          |> filter(fn: (r) => r._field == "temperature_C")${sensorFilter}
          |> ${groupClause}

        base |> mean() |> yield(name: "avg")
        base |> max() |> yield(name: "peak")
        base |> min() |> yield(name: "low")
      `

      const rows = await api.collectRows<{ _value: number; result: string }>(query)
      const avgRow = rows.find((r) => r.result === 'avg')
      const peakRow = rows.find((r) => r.result === 'peak')
      const lowRow = rows.find((r) => r.result === 'low')

      return {
        year,
        average: avgRow ? avgRow._value : null,
        peak: peakRow ? peakRow._value : null,
        low: lowRow ? lowRow._value : null,
      }
    })
  )

  return results
}

export function computePeriods(range: string): Array<{ start: string; stop: string }> {
  const now = new Date()
  let durationMs: number

  if (range.startsWith('custom:')) {
    const [, from, to] = range.split(':')
    const fromDate = new Date(`${from}T00:00:00Z`)
    const toDate = new Date(`${to}T00:00:00Z`)
    toDate.setUTCDate(toDate.getUTCDate() + 1) // inclusive stop
    durationMs = toDate.getTime() - fromDate.getTime()
    // For custom ranges, use the actual dates as the first period
    const periods = [{ start: from + 'T00:00:00Z', stop: toDate.toISOString().split('T')[0] + 'T00:00:00Z' }]
    for (let i = 1; i < 3; i++) {
      const pStop = new Date(fromDate.getTime() - (i - 1) * durationMs)
      const pStart = new Date(fromDate.getTime() - i * durationMs)
      periods.push({
        start: pStart.toISOString(),
        stop: pStop.toISOString(),
      })
    }
    return periods
  }

  // Parse relative range like "3d", "24h"
  const match = range.match(/^(\d+)([hd])$/)
  if (!match) {
    // Fallback: 24h
    durationMs = 24 * 3600 * 1000
  } else {
    const value = parseInt(match[1], 10)
    const unit = match[2]
    durationMs = unit === 'd' ? value * 86400000 : value * 3600000
  }

  const periods: Array<{ start: string; stop: string }> = []
  for (let i = 0; i < 3; i++) {
    const stop = new Date(now.getTime() - i * durationMs)
    const start = new Date(now.getTime() - (i + 1) * durationMs)
    periods.push({
      start: start.toISOString(),
      stop: stop.toISOString(),
    })
  }
  return periods
}

export async function queryStatDetail(
  range: string,
  stat: 'average' | 'peak',
  sensorId?: string
): Promise<Array<{ start: string; stop: string; average?: number | null; high?: number | null; low?: number | null }>> {
  const api = getQueryApi()
  const periods = computePeriods(range)
  const sensorFilter = sensorId ? `\n      |> filter(fn: (r) => r.id == "${sensorId}")` : ''
  const groupClause = sensorId ? 'group(columns: ["id"])' : 'group()'

  const results = await Promise.all(
    periods.map(async (period) => {
      const yields = stat === 'average'
        ? 'base |> mean() |> yield(name: "avg")'
        : 'base |> max() |> yield(name: "max")\n      base |> min() |> yield(name: "min")'

      const query = `
        base = from(bucket: "${bucket}")
          |> range(start: ${period.start}, stop: ${period.stop})
          |> filter(fn: (r) => r._field == "temperature_C")${sensorFilter}
          |> ${groupClause}

        ${yields}
      `

      const rows = await api.collectRows<{ _value: number; result: string }>(query)

      if (stat === 'average') {
        const avgRow = rows.find((r) => r.result === 'avg')
        return {
          start: period.start,
          stop: period.stop,
          average: avgRow ? avgRow._value : null,
        }
      } else {
        const maxRow = rows.find((r) => r.result === 'max')
        const minRow = rows.find((r) => r.result === 'min')
        return {
          start: period.start,
          stop: period.stop,
          high: maxRow ? maxRow._value : null,
          low: minRow ? minRow._value : null,
        }
      }
    })
  )

  return results
}

export async function queryBatteryHistory(sensorId: string): Promise<Array<{ time: string; value: number }>> {
  const api = getQueryApi()

  const query = `
    from(bucket: "${bucket}")
      |> range(start: -7d)
      |> filter(fn: (r) => r._field == "battery_ok")
      |> filter(fn: (r) => r.id == "${sensorId}")
      |> group(columns: ["id"])
      |> aggregateWindow(every: 1h, fn: last, createEmpty: false)
      |> yield(name: "history")
  `

  const rows = await api.collectRows<{ _time: string; _value: number }>(query)
  return rows.map((r) => ({ time: r._time, value: r._value * 100 }))
}

export interface WeatherCurrent {
  temperature_C: number
  feelslike_C: number
  humidity: number
  condition: string
  location: string
  timestamp: string
}

interface WeatherCurrentRow {
  _time: string
  temperature_C: number
  feelslike_C: number
  humidity: number
  condition: string
  location: string
}

export async function queryWeatherCurrent(): Promise<WeatherCurrent | null> {
  const api = getQueryApi()
  const query = `
    from(bucket: "${bucket}")
      |> range(start: -6h)
      |> filter(fn: (r) => r._measurement == "weather")
      |> filter(fn: (r) => r._field == "temperature_C" or r._field == "feelslike_C" or r._field == "humidity")
      |> last()
      |> pivot(rowKey: ["_time", "location", "condition"], columnKey: ["_field"], valueColumn: "_value")
      |> keep(columns: ["_time", "temperature_C", "feelslike_C", "humidity", "location", "condition"])
  `
  const rows = await api.collectRows<WeatherCurrentRow>(query)
  if (rows.length === 0) return null
  const r = rows[0]
  return {
    temperature_C: r.temperature_C,
    feelslike_C: r.feelslike_C,
    humidity: r.humidity,
    condition: r.condition,
    location: r.location,
    timestamp: r._time,
  }
}

export async function queryWeatherHistory(range: string): Promise<Array<{ time: string; value: number }>> {
  const api = getQueryApi()
  const period = windowPeriod(range)
  const query = `
    from(bucket: "${bucket}")
      |> range(${parseRange(range)})
      |> filter(fn: (r) => r._measurement == "weather")
      |> filter(fn: (r) => r._field == "temperature_C")
      |> group()
      |> aggregateWindow(every: ${period}, fn: mean, createEmpty: false)
      |> yield(name: "weather_history")
  `
  const rows = await api.collectRows<HistoryRow>(query)
  return rows.map((r) => ({ time: r._time, value: r._value }))
}
