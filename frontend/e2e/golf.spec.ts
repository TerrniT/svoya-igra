import { expect, test, type Page } from '@playwright/test'
import { createHostRoom } from './room'

async function putt(page: Page) {
  const kicker = page.locator('.golf-kicker')
  const stroke = page.locator('.golf-aim p').first()
  await expect(stroke).toBeVisible()
  const before = `${await kicker.innerText()}|${await stroke.innerText()}`

  await page.evaluate(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement)
      active.blur()
  })
  await page.keyboard.press('Space')

  await expect.poll(async () => {
    if (await page.getByRole('heading', { name: 'Карточка клуба' }).isVisible())
      return 'done'
    if (!(await stroke.isVisible()))
      return before
    return `${await kicker.innerText()}|${await stroke.innerText()}`
  }, { timeout: 20_000 }).not.toBe(before)
}

test('одиночный круг: удар, лунки и карточка', async ({ page }) => {
  test.setTimeout(240_000)
  await createHostRoom(page, 'golf', 'Тигр')
  await page.getByRole('button', { name: 'Начать игру' }).click()

  await expect(page.getByRole('heading', { name: 'Аллея' })).toBeVisible()
  await expect(page.getByText('Лунка 1 / 5')).toBeVisible()
  await expect(page.getByText('Удар 1 / 8')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Поле не открылось' })).toHaveCount(0)

  for (let shot = 0; shot < 40; shot += 1) {
    if (await page.getByRole('heading', { name: 'Карточка клуба' }).isVisible())
      break
    await putt(page)
  }

  await expect(page.getByRole('heading', { name: 'Карточка клуба' })).toBeVisible()
  await expect(page.getByRole('rowheader', { name: /Тигр/ })).toBeVisible()
  await expect(page.getByText('победитель')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ещё круг' })).toBeVisible()
})
