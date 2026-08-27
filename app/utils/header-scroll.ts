export type HeaderScrollDirection = 'up' | 'down'

export interface HeaderScrollTracker {
  lastY: number
  direction?: HeaderScrollDirection
  distance: number
}

export const HEADER_TOP_ZONE = 24
export const HEADER_HIDE_START = 96
export const HEADER_HIDE_DISTANCE = 24
export const HEADER_SHOW_DISTANCE = 10

export function createHeaderScrollTracker(scrollY = 0): HeaderScrollTracker {
  return {
    lastY: normalizeScrollY(scrollY),
    distance: 0
  }
}

export function resetHeaderScrollTracker(
  tracker: HeaderScrollTracker,
  scrollY: number
): void {
  tracker.lastY = normalizeScrollY(scrollY)
  tracker.direction = undefined
  tracker.distance = 0
}

export function updateHeaderVisibility(
  tracker: HeaderScrollTracker,
  scrollY: number,
  hidden: boolean
): boolean {
  const nextY = normalizeScrollY(scrollY)
  const delta = nextY - tracker.lastY
  tracker.lastY = nextY

  if (nextY <= HEADER_TOP_ZONE) {
    tracker.direction = undefined
    tracker.distance = 0
    return false
  }

  if (delta === 0) {
    return hidden
  }

  const direction: HeaderScrollDirection = delta > 0 ? 'down' : 'up'

  if (tracker.direction !== direction) {
    tracker.direction = direction
    tracker.distance = 0
  }

  tracker.distance += Math.abs(delta)

  if (direction === 'down'
    && nextY >= HEADER_HIDE_START
    && tracker.distance >= HEADER_HIDE_DISTANCE) {
    tracker.distance = 0
    return true
  }

  if (direction === 'up' && tracker.distance >= HEADER_SHOW_DISTANCE) {
    tracker.distance = 0
    return false
  }

  return hidden
}

function normalizeScrollY(scrollY: number): number {
  return Number.isFinite(scrollY) ? Math.max(0, scrollY) : 0
}
