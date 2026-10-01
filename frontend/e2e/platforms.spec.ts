import { expect, test } from '@playwright/test'
import { createHostRoom, joinRoom } from './room'

test('двое ходят, платформы помечаются и исчезают', async ({ page, context }) => {
  const guest = await context.newPage()

  const code = await createHostRoom(page, 'platforms', 'Лео')
  await joinRoom(guest, code, 'Мара')
  await expect(page.getByText('Мара', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Начать игру' })).toBeEnabled()

  await page.getByRole('button', { name: 'Начать игру' }).click()
  await expect(page.getByRole('heading', { name: 'Платформы' })).toBeVisible()
  await expect(guest.getByRole('heading', { name: 'Платформы' })).toBeVisible()
  await expect(page.getByText('Толкните фигуру на соседнюю платформу')).toBeVisible()

  const hostTargets = page.locator('.platform.target')
  await expect(hostTargets.first()).toBeVisible()
  await hostTargets.first().click()

  await expect(guest.getByText('Толкните фигуру на соседнюю платформу')).toBeVisible()
  const guestTargets = guest.locator('.platform.target')
  await expect(guestTargets.first()).toBeVisible()
  await guestTargets.first().click()

  await expect(page.getByText(/Платформа уходит|Уходят 2 платформы/)).toBeVisible()
  await expect(page.locator('.platform.marked')).toHaveCount(2)
  await expect(page.locator('.platform.gone')).toHaveCount(2, { timeout: 8000 })
  await expect(page.getByText(/Круг 2/)).toBeVisible()
})
