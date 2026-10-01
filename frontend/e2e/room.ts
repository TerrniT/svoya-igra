import { expect, type Page } from '@playwright/test'

export async function createHostRoom(page: Page, gameId: 'whoami' | 'golf' | 'platforms', name: string) {
  await page.goto(`/g/${gameId}`)
  await page.locator('#host-name').fill(name)
  await page.getByRole('button', { name: 'Создать' }).click()
  const badge = page.getByText(/Комната \d{4}/)
  await expect(badge).toBeVisible()
  const code = (await badge.innerText()).match(/\d{4}/)?.[0]
  if (!code)
    throw new Error('Код комнаты не появился')
  return code
}

export async function joinRoom(page: Page, code: string, name: string) {
  await page.goto('/join')
  await page.locator('#room-code').fill(code)
  await page.locator('#join-name').fill(name)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('heading', { name: 'Сбор игроков' })).toBeVisible()
}
