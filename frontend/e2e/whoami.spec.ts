import { expect, test } from '@playwright/test'
import { createHostRoom, joinRoom } from './room'

test('ведущий отмечает угадавших, и оба видят итог', async ({ page, context }) => {
  const guest = await context.newPage()

  const code = await createHostRoom(page, 'whoami', 'Лео')
  await joinRoom(guest, code, 'Мара')
  await expect(page.getByText('Мара', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Начать игру' })).toBeEnabled()

  await page.getByRole('button', { name: 'Начать игру' }).click()
  await expect(page.getByRole('heading', { name: 'Карточки на лбу' })).toBeVisible()
  await expect(guest.getByRole('heading', { name: 'Карточки на лбу' })).toBeVisible()

  const hostCard = page.getByRole('listitem').filter({ hasText: 'Вы' })
  const guestCard = guest.getByRole('listitem').filter({ hasText: 'Вы' })
  await expect(hostCard.getByText('???', { exact: true })).toBeVisible()
  await expect(guestCard.getByText('???', { exact: true })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Мара' }).getByText('???')).toHaveCount(0)
  await expect(guest.getByRole('listitem').filter({ hasText: 'Лео' }).getByText('???')).toHaveCount(0)

  const table = page.getByRole('main')
  await table.getByRole('button', { name: 'Угадал' }).first().click()
  await expect(table.getByText('угадал', { exact: true })).toBeVisible()
  await table.getByRole('button', { name: 'Угадал' }).click()

  await expect(page.getByRole('heading', { name: 'Все угаданы!' })).toBeVisible()
  await expect(guest.getByRole('heading', { name: 'Все угаданы!' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ещё раз' })).toBeVisible()
  await expect(guest.getByText('Ждём, пока ведущий запустит новый раунд.')).toBeVisible()
})
