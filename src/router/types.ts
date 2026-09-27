export {}

declare module 'vue-router' {
  interface RouteMeta {
    requiresPlayers?: boolean
    localOnly?: boolean
    requiresHost?: boolean
    gameId?: string
  }
}
