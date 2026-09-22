<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { DoorOpenIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { GAME_CATALOG } from '@/games/catalog'
import { applyThemeFromId } from '@/themes/apply'

applyThemeFromId('studio')
</script>

<template>
    <div class="mx-auto flex max-w-5xl flex-col gap-6 sm:gap-8">
    <section class="flex flex-col gap-3 pt-1 text-center sm:pt-4">
      <Badge variant="secondary" class="mx-auto">Выберите игру</Badge>
      <h1 class="font-display text-3xl tracking-[0.12em] text-balance uppercase sm:text-5xl sm:tracking-[0.14em]">
        Своя игра
      </h1>
      <p class="text-muted-foreground text-pretty text-sm sm:text-base">
        Сначала тип игры, потом комната и тема. Гости заходят по коду — игра подтянется сама.
      </p>
    </section>

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card
        v-for="game in GAME_CATALOG"
        :key="game.id"
        class="transition-colors hover:border-primary/50"
      >
        <CardHeader>
          <CardTitle>{{ game.name }}</CardTitle>
          <CardDescription>{{ game.description }}</CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-3">
          <p class="text-muted-foreground text-xs">
            От {{ game.minPlayers }} игроков
            <span v-if="game.hostPlays"> · ведущий тоже играет</span>
            <span v-if="game.supportsLocal"> · можно на одном экране</span>
          </p>
          <Button size="lg" as-child>
            <RouterLink :to="{ name: 'game-lobby', params: { gameId: game.id } }">
              Выбрать
            </RouterLink>
          </Button>
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Уже есть код?</CardTitle>
        <CardDescription>Войдите в комнату ведущего — тип игры и тема уже заданы.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" size="lg" as-child>
          <RouterLink to="/join">
            <DoorOpenIcon data-icon="inline-start" />
            Ввести код
          </RouterLink>
        </Button>
      </CardContent>
    </Card>
  </div>
</template>
