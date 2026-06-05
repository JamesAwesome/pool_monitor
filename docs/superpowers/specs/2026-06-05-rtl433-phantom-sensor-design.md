# rtl_433 Phantom Sensor Fix — Design

**Date:** 2026-06-05
**Status:** Approved (design); pending implementation plan

## Problem

A phantom sensor (id `29908`, model `Inkbird-ITH20R`) reports a **dead-flat ~22.0 °C / 71.6 °F**
and pollutes pool stats (averages/peaks pulled toward 71.6 °F). It is **not a second
physical device** — diagnosed 2026-06-05 by stopping the single rtl_433 container and
watching both MQTT topics go silent.

### Root cause

1. The rtl_433 MQTT output uses **`retain=1`** with **no explicit topic**, so it publishes to
   `rtl_433/<container-hostname>/events`. The hostname is the container ID, which **changes
   on every `docker compose up --force-recreate`** (which the deployment docs instruct after
   credential changes).
2. A **previous** container instance (`rtl_433/f3b8342985f9/events`) left a **retained**
   last-reading of `22.0` frozen on the broker. The **current** container publishes the real,
   varying pool curve on `rtl_433/f868709a2923/events`.
3. Telegraf (`client_id = telegraf-pool`) has **no `json_time_key`**, so it stamps every
   message at **arrival time**, and it **re-subscribes on each reconnect**. It is currently
   **flapping (~6 reconnects/hour)**. On each re-subscribe the broker re-delivers the retained
   message for every matching topic — including the dead `f3b8…` topic — so the frozen `22.0`
   gets re-ingested as a "fresh" point each time.

Net: a flat-22 °C ghost, kept alive by `retain=1` + an orphaned topic from a recreated
container + Telegraf's reconnect-driven resubscribes.

## Decisions (confirmed)

- **Pin the topic two ways** (belt-and-suspenders): explicit events topic in the `-F` URL
  **and** a stable container hostname.
- **Drop `retain=1`** — removes the re-ingestion mechanism itself, not just the orphan topic.
- **Do NOT purge** historical ghost data — past stats stay as-is; only stop new ghost data.
- **Investigate the Telegraf reconnect flapping** as part of this work.

## Scope

In: `docker-compose.yml` (rtl_433 service), `telegraf/telegraf.conf` (flapping fix),
`docs/deployment.md` (troubleshooting section), and a one-time operational runbook to clear
the existing retained messages and verify.

Out: deleting historical InfluxDB points; any rtl_433/Inkbird hardware or protocol changes.

## Design

### 1. `docker-compose.yml` — rtl_433 service

Make the topic deterministic and stop retaining. Current command:

```yaml
    command: >
      -f 433.92M
      -R 194
      -F mqtt://mosquitto:1883,user=${MQTT_USER},pass=${MQTT_PASSWORD},retain=1
```

Changes:
- Add a stable **`hostname: rtl_433`** to the service (pins the default topic prefix used by
  the `devices`/`states` topics rtl_433 also publishes; harmless alongside the explicit events
  topic below).
- In the `-F` URL: **add `events=rtl_433/sensor/events`** and **remove `retain=1`**.

Target command:

```yaml
    hostname: rtl_433
    command: >
      -f 433.92M
      -R 194
      -F mqtt://mosquitto:1883,user=${MQTT_USER},pass=${MQTT_PASSWORD},events=rtl_433/sensor/events
```

- The new topic `rtl_433/sensor/events` is **still matched by Telegraf's
  `topics = ["rtl_433/+/events"]`** subscription (`rtl_433/<single-segment>/events`), so
  **no Telegraf topic change is required**.
- Update the existing comment block that warns about `--force-recreate` to note that, with a
  pinned topic, recreates no longer spawn new (ghost-prone) topics.

Implementation note for the plan: confirm `events=` is the correct rtl_433 `-F mqtt` option
name for the events topic (check `docker logs rtl_433` at startup, which prints the resolved
MQTT topics). If the option differs in the pinned image version, use the image's actual
syntax — the requirement is "events topic is a fixed `rtl_433/<segment>/events` string."

### 2. Operational runbook (one-time, on the broker host / Pi)

Pinning the topic and dropping retain affect **future** publishes only; the **existing**
retained messages persist on the broker and keep being re-delivered until explicitly cleared.

1. Recreate rtl_433 with the new config:
   `docker compose up -d --force-recreate rtl_433`
2. **Clear the orphan retained messages** on both old topics — the ghost `f3b8…` *and* the
   old real `f868…` (both held retained values; the new topic is `…/sensor/events`):
   ```bash
   docker compose exec mosquitto mosquitto_pub -r -n -u "$MQTT_USER" -P "$MQTT_PASSWORD" \
     -t 'rtl_433/f3b8342985f9/events'
   docker compose exec mosquitto mosquitto_pub -r -n -u "$MQTT_USER" -P "$MQTT_PASSWORD" \
     -t 'rtl_433/f868709a2923/events'
   ```
   (`-r -n` = empty retained payload, which deletes the retained message.)
3. Verify (see Verification).

This runbook is documented in `docs/deployment.md` (Troubleshooting) so it is repeatable and
discoverable, not just a one-off.

### 3. Telegraf flapping investigation (`telegraf/telegraf.conf`)

`telegraf-pool` reconnects ~6×/hour, which is what repeatedly re-triggers retained-message
re-delivery. The fix is investigation-led:

1. Gather evidence: `docker compose logs --since 1h telegraf` (disconnect reasons) and
   `docker compose logs --since 1h mosquitto` (disconnect/keepalive-timeout lines).
2. Apply the remediation the logs point to, in `[[inputs.mqtt_consumer]]`. Likely candidates
   (to be confirmed, not all applied blindly):
   - set an explicit **`keepalive`** and **`connection_timeout`**;
   - re-evaluate **`persistent_session = true`** + QoS 1 (a persistent session with a flapping
     client amplifies redelivery; if the session is not actually needed, `persistent_session =
     false` avoids server-side subscription state).
3. Success = reconnects drop to roughly the Telegraf flush cadence / near-zero idle reconnects.

If the logs show the flapping originates outside Telegraf's config (e.g. the broker's
`max_keepalive`, or a network/DNS issue between server and Pi in split mode), document the
finding and the corresponding fix rather than forcing a `telegraf.conf` change.

### 4. Docs (`docs/deployment.md`)

Add a **"Phantom / duplicate sensor (stale retained MQTT message)"** entry to the
Troubleshooting section: the symptom (a flat, never-changing second reading for an existing
sensor id), the mechanism (retained message on an orphaned `rtl_433/<old-hostname>/events`
topic from a recreated container, re-ingested on Telegraf reconnect), and the fix (pinned
topic + no retain, and the `mosquitto_pub -r -n` clear command, generalized to "the old
topic hostname").

## Verification

- **InfluxDB (primary):** after deploy + clear, query distinct `topic` tags for
  `_measurement == "mqtt_consumer"` / `r.id == "29908"` over the last ~30 min — expect **only
  `rtl_433/sensor/events`**, and confirm the flat-22 stream has stopped producing new points.
  (Reuse the diagnostic Flux queries from the investigation.)
- **Telegraf:** re-check `docker compose logs --since 1h mosquitto | grep telegraf-pool` —
  reconnect frequency should be materially lower.
- **No regression:** the real pool sensor continues reporting on `rtl_433/sensor/events`;
  pool stats reflect only real readings going forward.

## Risks / notes

- The historical 22 °C points remain in InfluxDB (by decision), so **past** season/avg/peak
  stats stay polluted until they age out of the relevant windows. The exact purge predicate is
  recorded here for future use if wanted:
  `_measurement="mqtt_consumer" AND topic="rtl_433/f3b8342985f9/events"`.
- Changing the MQTT topic string has no downstream impact: Telegraf filters by `id` (not
  topic), and Grafana/dashboard queries filter by `id` + `_measurement` — verified during the
  investigation.
- This is a config + ops change with no application-code or automated-test surface; correctness
  is established by the InfluxDB/Telegraf verification above, not by unit tests.
