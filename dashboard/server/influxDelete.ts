import { DeleteAPI } from '@influxdata/influxdb-client-apis'
import { InfluxDB } from '@influxdata/influxdb-client'

const url = process.env.INFLUXDB_URL ?? 'http://localhost:8086'
const token = process.env.INFLUXDB_TOKEN ?? ''
const org = process.env.INFLUXDB_ORG ?? ''
const bucket = process.env.INFLUXDB_BUCKET ?? ''

/**
 * Delete the single chemistry point at the given ISO instant. InfluxDB deletes a
 * half-open [start, stop) window, so we delete [id, id+1ms) filtered to the
 * chemistry measurement — narrow enough to hit exactly that point.
 */
export async function deleteChemistryPoint(id: string): Promise<void> {
  const deleteApi = new DeleteAPI(new InfluxDB({ url, token }))
  const start = new Date(id).toISOString()
  const stop = new Date(new Date(id).getTime() + 1).toISOString()
  await deleteApi.postDelete({
    org,
    bucket,
    body: { start, stop, predicate: '_measurement="chemistry"' },
  })
}
