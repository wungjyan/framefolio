import { describe, expect, it } from 'vitest'

import {
  createHeaderScrollTracker,
  HEADER_HIDE_DISTANCE,
  HEADER_HIDE_START,
  HEADER_SHOW_DISTANCE,
  HEADER_TOP_ZONE,
  resetHeaderScrollTracker,
  updateHeaderVisibility
} from '../../app/utils/header-scroll'

describe('gallery header scroll visibility', () => {
  it('stays visible near the page top', () => {
    const tracker = createHeaderScrollTracker()
    let hidden = false

    hidden = updateHeaderVisibility(tracker, HEADER_TOP_ZONE, hidden)
    hidden = updateHeaderVisibility(tracker, HEADER_TOP_ZONE - 1, hidden)

    expect(hidden).toBe(false)
  })

  it('hides only after sustained downward scrolling beyond the start zone', () => {
    const tracker = createHeaderScrollTracker(HEADER_HIDE_START - 1)
    let hidden = false

    hidden = updateHeaderVisibility(
      tracker,
      HEADER_HIDE_START + HEADER_HIDE_DISTANCE - 2,
      hidden
    )
    expect(hidden).toBe(false)

    hidden = updateHeaderVisibility(
      tracker,
      HEADER_HIDE_START + HEADER_HIDE_DISTANCE,
      hidden
    )
    expect(hidden).toBe(true)
  })

  it('ignores small direction jitter and shows after deliberate upward movement', () => {
    const tracker = createHeaderScrollTracker(200)
    let hidden = updateHeaderVisibility(
      tracker,
      200 + HEADER_HIDE_DISTANCE,
      false
    )

    hidden = updateHeaderVisibility(tracker, tracker.lastY - 2, hidden)
    expect(hidden).toBe(true)

    hidden = updateHeaderVisibility(tracker, tracker.lastY + 1, hidden)
    hidden = updateHeaderVisibility(tracker, tracker.lastY - 2, hidden)
    expect(hidden).toBe(true)

    hidden = updateHeaderVisibility(
      tracker,
      tracker.lastY - HEADER_SHOW_DISTANCE,
      hidden
    )
    expect(hidden).toBe(false)
  })

  it('always shows again at the top and can reset its baseline', () => {
    const tracker = createHeaderScrollTracker(160)
    let hidden = updateHeaderVisibility(
      tracker,
      160 + HEADER_HIDE_DISTANCE,
      false
    )

    expect(hidden).toBe(true)
    hidden = updateHeaderVisibility(tracker, 0, hidden)
    expect(hidden).toBe(false)

    resetHeaderScrollTracker(tracker, 320)
    expect(tracker).toEqual({ lastY: 320, distance: 0 })
  })
})
