import { createRouter, parseSearchWith } from '@tanstack/react-router'

import { routeTree } from './routeTree.gen'

/**
 * Serialize search values verbatim. TanStack's default stringifier
 * re-serializes values that parse as JSON, so a string `1` is written as
 * `%221%22` and then parses back as the number 1, breaking validated
 * string state. Writing plain strings keeps URLs stable across reloads.
 */
function stringifySearch(search: Record<string, unknown>): string {
  const parameters = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined) parameters.set(key, String(value))
  }
  const query = parameters.toString()
  return query ? `?${query}` : ''
}

/**
 * Keep parsed search values as strings. TanStack's qss decoder has already
 * coerced numeric strings (`1` -> 1) by the time a parser runs — that layer
 * is normalized in sanitizeTasksSearch — and the default parser would
 * additionally JSON-parse string values like true, null, or "1". Identity
 * keeps everything the decoder left as a string.
 */
const parseSearch = parseSearchWith((value) => value)

export function getRouter() {
  return createRouter({ routeTree, stringifySearch, parseSearch })
}
