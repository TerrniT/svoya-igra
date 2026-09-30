export async function resolveJoinUrl(code: string) {
  const path = `/join/${code}`
  const local = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

  if (!local)
    return `${window.location.origin}${path}`

  try {
    const response = await fetch('/api/join-info')
    const data = await response.json() as { origins?: string[] }
    const lan = data.origins?.[0]
    if (lan)
      return `${lan}${path}`
  }
  catch {
    // keep localhost fallback
  }

  return `${window.location.origin}${path}`
}
