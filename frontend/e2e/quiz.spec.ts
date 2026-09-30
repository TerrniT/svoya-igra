import { expect, test, type Page } from '@playwright/test'

const bank = {
  categories: [
    { id: 'cat-e2e', name: 'Проверка', order: 0 },
  ],
  questions: [
    {
      id: 'q-100',
      categoryId: 'cat-e2e',
      value: 100,
      text: 'Столица Франции?',
      kind: 'single',
      answers: [
        { id: 'a-paris', text: 'Париж', isCorrect: true },
        { id: 'a-lyon', text: 'Лион', isCorrect: false },
      ],
    },
    {
      id: 'q-200',
      categoryId: 'cat-e2e',
      value: 200,
      text: 'Какие реки обычно называют самыми длинными?',
      kind: 'multi',
      answers: [
        { id: 'a-nile', text: 'Нил', isCorrect: true },
        { id: 'a-amazon', text: 'Амазонка', isCorrect: true },
        { id: 'a-thames', text: 'Темза', isCorrect: false },
      ],
    },
    {
      id: 'q-300',
      categoryId: 'cat-e2e',
      value: 300,
      text: 'Почему столицу Австралии путают с Сиднеем?',
      kind: 'free',
      answers: [
        { id: 'a-canberra', text: 'Столица — Канберра.', isCorrect: true },
      ],
    },
  ],
}

async function award(page: Page, player: string) {
  await page.getByRole('button', { name: player, exact: true }).click()
  await page.getByRole('button', { name: 'Начислить выбранным' }).click()
}

test('локальная партия проходит поле и показывает итог', async ({ page }) => {
  await page.addInitScript((stored) => {
    localStorage.setItem('svoya-igra:quiz-bank:v2', JSON.stringify(stored))
    localStorage.removeItem('svoya-igra:game')
  }, bank)

  await page.goto('/g/quiz')
  await page.getByRole('tab', { name: 'Один экран' }).click()

  const name = page.locator('#player-name')
  await name.fill('Аня')
  await page.getByRole('button', { name: 'Добавить' }).click()
  await name.fill('Боря')
  await page.getByRole('button', { name: 'Добавить' }).click()
  await expect(page.getByText('вопросов: 3')).toBeVisible()

  await page.getByRole('button', { name: 'Начать игру' }).click()
  await page.getByRole('button', { name: 'Аня', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Выбирает Аня' })).toBeVisible()

  await page.getByRole('button', { name: '100', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Столица Франции?' })).toBeVisible()
  await page.getByRole('radio', { name: 'Париж' }).click()
  await page.getByRole('button', { name: 'Ответить' }).click()
  await expect(page.getByText('Париж').last()).toBeVisible()
  await award(page, 'Аня')
  await expect(page).toHaveURL(/\/game$/)

  await page.getByRole('button', { name: '200', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Какие реки обычно называют самыми длинными?' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Нил' }).click()
  await page.getByRole('checkbox', { name: 'Амазонка' }).click()
  await page.getByRole('button', { name: 'Ответить' }).click()
  await award(page, 'Боря')
  await expect(page).toHaveURL(/\/game$/)

  await page.getByRole('button', { name: '300', exact: true }).click()
  await page.getByPlaceholder('Ваш ответ').fill('Канберра, а не Сидней')
  await page.getByRole('button', { name: 'Ответить' }).click()
  await award(page, 'Аня')

  await expect(page).toHaveURL(/\/game\/results/)
  await expect(page.getByText('Сыграно вопросов: 3 из 3')).toBeVisible()
  await expect(page.getByText('Аня').first()).toBeVisible()
  await expect(page.getByText('400').first()).toBeVisible()
  await expect(page.getByText('Боря').first()).toBeVisible()
  await expect(page.getByText('200').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ещё партия' })).toBeVisible()
})
