export {}

declare module 'vue-router' {
  interface RouteMeta {
    requiresPlayers?: boolean
    requiresHost?: boolean
  }
}
