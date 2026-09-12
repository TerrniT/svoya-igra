<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useRoom } from '@/composables/useRoom'

const route = useRoute()
const router = useRouter()
const room = useRoom()

const rawCode = Array.isArray(route.params.code) ? route.params.code[0] : route.params.code
const code = ref((rawCode ?? '').replace(/\D/g, '').slice(0, 4))
const name = ref('')
const nameError = ref('')
const codeError = ref('')

onMounted(() => {
  if (room.snapshot.value)
    router.replace({ name: 'lobby' })
})

async function join() {
  nameError.value = ''
  codeError.value = ''

  if (code.value.length !== 4) {
    codeError.value = 'Нужен 4-значный код'
    return
  }
  if (!name.value.trim()) {
    nameError.value = 'Как вас представить прайду?'
    return
  }

  try {
    await room.joinRoom(code.value, name.value)
    router.replace({ name: 'lobby' })
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : 'Не удалось войти')
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col gap-6 pt-4">
    <section class="flex flex-col gap-2 text-center">
      <h1 class="font-display text-3xl tracking-[0.12em] uppercase sm:text-4xl">Вход в комнату</h1>
      <p class="text-muted-foreground">Введите код с экрана ведущего или пришлите по QR.</p>
    </section>

    <Card>
      <CardHeader>
        <CardTitle>Присоединиться</CardTitle>
        <CardDescription>Имя увидят все в комнате. Ведущий начнёт игру, когда прайд соберётся.</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="flex flex-col gap-4" @submit.prevent="join">
          <FieldGroup>
            <Field :data-invalid="codeError ? true : undefined">
              <FieldLabel for="room-code">Код</FieldLabel>
              <Input
                id="room-code"
                v-model="code"
                class="font-board text-center text-3xl tracking-[0.4em]"
                inputmode="numeric"
                maxlength="4"
                placeholder="0000"
                :aria-invalid="codeError ? true : undefined"
                @update:model-value="value => code = String(value).replace(/\D/g, '').slice(0, 4)"
              />
              <FieldError v-if="codeError" :errors="[codeError]" />
            </Field>
            <Field :data-invalid="nameError ? true : undefined">
              <FieldLabel for="join-name">Имя</FieldLabel>
              <Input
                id="join-name"
                v-model="name"
                maxlength="32"
                placeholder="Например, Мара"
                :aria-invalid="nameError ? true : undefined"
              />
              <FieldError v-if="nameError" :errors="[nameError]" />
            </Field>
          </FieldGroup>
          <Button type="submit" size="lg" :disabled="room.connecting.value">
            {{ room.connecting.value ? 'Входим…' : 'Войти' }}
          </Button>
        </form>
      </CardContent>
      <CardFooter>
        <Button variant="ghost" class="w-full" @click="router.push({ name: 'lobby' })">
          Назад
        </Button>
      </CardFooter>
    </Card>
  </div>
</template>
