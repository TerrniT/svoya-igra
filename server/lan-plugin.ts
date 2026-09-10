import os from 'node:os'
import type { Connect, Plugin } from 'vite'

function lanOrigins(port: number, https: boolean) {
  const protocol = https ? 'https:' : 'http:'
  const origins: string[] = []

  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family !== 'IPv4' || item.internal)
        continue
      origins.push(`${protocol}//${item.address}:${port}`)
    }
  }

  return origins
}

function joinInfoMiddleware(httpServer: { address: () => string | { port: number } | null }, https: boolean): Connect.NextHandleFunction {
  return (request, response, next) => {
    if (request.url?.split('?')[0] !== '/api/join-info') {
      next()
      return
    }

    const address = httpServer.address()
    const port = typeof address === 'object' && address ? address.port : 5173
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({
      origins: lanOrigins(port, https),
    }))
  }
}

export function lanJoinPlugin(): Plugin {
  return {
    name: 'svoya-igra-lan-join',
    configureServer(server) {
      if (!server.httpServer)
        return
      server.middlewares.use(joinInfoMiddleware(server.httpServer, Boolean(server.config.server.https)))
    },
    configurePreviewServer(server) {
      if (!server.httpServer)
        return
      server.middlewares.use(joinInfoMiddleware(server.httpServer, Boolean(server.config.preview.https)))
    },
  }
}
