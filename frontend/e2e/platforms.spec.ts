import { expect, test, type Page } from '@playwright/test'
import { createHostRoom, joinRoom } from './room'

async function push(page: Page) {
  await page.evaluate(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement)
      active.blur()
  })
  await page.keyboard.press('Space')
}

test('двое толкают фигуры, платформы помечаются и исчезают', async ({ page, context }) => {
  test.setTimeout(60_000)
  const guest = await context.newPage()

  const code = await createHostRoom(page, 'platforms', 'Лео')
  await joinRoom(guest, code, 'Мара')
  await expect(page.getByText('Мара', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Начать игру' })).toBeEnabled()

  await page.getByRole('button', { name: 'Начать игру' }).click()
  await expect(page.getByRole('heading', { name: 'Платформы' })).toBeVisible()
  await expect(guest.getByRole('heading', { name: 'Платформы' })).toBeVisible()
  await expect(page.locator('canvas[aria-label="Девять платформ в пропасти"]')).toBeVisible()
  await expect(page.getByText('Ваш толчок')).toBeVisible()

  await push(page)
  await expect(guest.getByText('Ваш толчок')).toBeVisible({ timeout: 20_000 })
  await push(guest)

  await expect(page.locator('.platforms-banner')).toContainText(/платформ/i, { timeout: 20_000 })
  await expect(page.locator('.platforms-kicker')).toHaveText('Круг 2', { timeout: 8000 })
})
