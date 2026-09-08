import { describe, expect, it } from 'vitest'
import type { Person } from './types'
import { isUnavailable, unavailabilitySummary, withDayToggled, withPartToggled } from './availability'

const tom: Person = { id: 't', name: 'Tom', color: '#000', unavailable: { 0: ['afternoon'], 2: ['morning', 'afternoon', 'evening'] } }
const free: Person = { id: 'f', name: 'Free', color: '#000' }

describe('isUnavailable', () => {
  it('blocks only the listed day-part', () => {
    expect(isUnavailable(tom, 0, 'afternoon')).toBe(true)
    expect(isUnavailable(tom, 0, 'morning')).toBe(false)
    expect(isUnavailable(tom, 1, 'afternoon')).toBe(false)
  })

  it('blocks anytime chores only when the whole day is blocked', () => {
    expect(isUnavailable(tom, 0, 'anytime')).toBe(false)
    expect(isUnavailable(tom, 0, undefined)).toBe(false)
    expect(isUnavailable(tom, 2, 'anytime')).toBe(true)
    expect(isUnavailable(tom, 2, undefined)).toBe(true)
  })

  it('is false for a person with no commitments', () => {
    expect(isUnavailable(free, 2, 'evening')).toBe(false)
  })
})

describe('toggling', () => {
  it('adds and removes a part, keeping canonical order', () => {
    const p = withPartToggled(free, 4, 'evening')
    expect(withPartToggled(p, 4, 'morning').unavailable).toEqual({ 4: ['morning', 'evening'] })
    expect(withPartToggled(p, 4, 'evening')).toEqual(free)
  })

  it('toggles a whole day', () => {
    expect(withDayToggled(tom, 0).unavailable?.[0]).toEqual(['morning', 'afternoon', 'evening'])
    expect(withDayToggled(tom, 2).unavailable?.[2]).toBeUndefined()
  })
})

describe('unavailabilitySummary', () => {
  it('abbreviates parts and names whole days', () => {
    expect(unavailabilitySummary(tom)).toBe('Mon pm · Wed')
    expect(unavailabilitySummary(free)).toBe('')
  })
})
