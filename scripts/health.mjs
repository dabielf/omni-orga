const requestTimeoutMs = 1_000

export async function appIsHealthy(url) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(requestTimeoutMs),
    })
    return response.ok && (await response.text()).includes('data-omni-orga="app"')
  } catch {
    return false
  }
}
