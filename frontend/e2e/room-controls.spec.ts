import { expect, test } from '@playwright/test'
import { createHostRoom, joinRoom } from './room'

test('ведущий ставит паузу, заканчивает игру и удаляет игрока', async ({ page, context }) => {
  const guest = await context.newPage()

  const code = await createHostRoom(page, 'whoami', 'Лео')
  await joinRoom(guest, code, 'Мара')
  await page.getByRole('button', { name: 'Начать игру' }).click()
  await expect(page.getByRole('heading', { name: 'Карточки на лбу' })).toBeVisible()

  await page.getByRole('button', { name: /комната/i }).click()
  await page.getByRole('menuitem', { name: 'Пауза' }).click()
  await expect(page.getByRole('heading', { name: 'Пауза' })).toBeVisible()
  await expect(guest.getByText('Ведущий поставил игру на паузу.')).toBeVisible()

  await page.getByRole('button', { name: 'Продолжить' }).click()
  await expect(page.getByRole('heading', { name: 'Карточки на лбу' })).toBeVisible()
  await expect(guest.getByRole('heading', { name: 'Карточки на лбу' })).toBeVisible()

  await page.getByRole('button', { name: /комната/i }).click()
  await page.getByRole('menuitem', { name: 'Закончить игру' }).click()
  await page.getByRole('button', { name: 'Закончить' }).click()
  await expect(page.getByRole('heading', { name: 'Сбор игроков' })).toBeVisible()
  await expect(guest.getByRole('heading', { name: 'Сбор игроков' })).toBeVisible()

  await page.getByRole('button', { name: 'Начать игру' }).click()
  await expect(page.getByRole('heading', { name: 'Карточки на лбу' })).toBeVisible()

  await page.getByRole('button', { name: /комната/i }).click()
  await page.getByRole('menuitem', { name: 'Удалить игрока' }).click()
  await page.getByRole('button', { name: 'Удалить Мара' }).click()
  await expect(guest.getByRole('heading', { name: 'Своя игра' })).toBeVisible()
  await expect(page.getByText('Мара', { exact: true })).toHaveCount(0)
})

test('игрок выходит из комнаты через меню', async ({ page, context }) => {
  const guest = await context.newPage()

  const code = await createHostRoom(page, 'whoami', 'Лео')
  await joinRoom(guest, code, 'Мара')

  await guest.getByRole('button', { name: /комната/i }).click()
  await guest.getByRole('menuitem', { name: 'Выйти из игры' }).click()
  await guest.getByRole('alertdialog').getByRole('button', { name: 'Выйти' }).click()
  await expect(guest.getByRole('heading', { name: 'Своя игра' })).toBeVisible()
  await expect(page.getByText('Мара', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Сбор игроков' })).toBeVisible()
})
