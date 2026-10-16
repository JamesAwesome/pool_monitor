// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseFlag, isOffSeason } from './mode'

describe('parseFlag', () => {
  it.each(['true', 'TRUE', ' yes ', '1', 'on'])('treats %j as on', (v) => {
    expect(parseFlag(v)).toBe(true)
  })
  it.each([undefined, '', 'false', '0', 'no', 'off', 'nope'])('treats %j as off', (v) => {
    expect(parseFlag(v)).toBe(false)
  })
})

describe('isOffSeason', () => {
  it('reads OFF_SEASON', () => {
    expect(isOffSeason({ OFF_SEASON: 'true' })).toBe(true)
    expect(isOffSeason({})).toBe(false)
  })
})
