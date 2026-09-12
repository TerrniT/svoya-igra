import type { Answer, Question, QuestionKind, QuestionValue, QuizBank } from '@/lib/types'

function choice(text: string, isCorrect: boolean): Answer {
  return { id: `${text}-${isCorrect ? 'ok' : 'no'}`, text, isCorrect }
}

function singleAnswers(correct: string, ...wrong: string[]): Answer[] {
  return [choice(correct, true), ...wrong.map(text => choice(text, false))]
}

function multiAnswers(correct: string[], wrong: string[]): Answer[] {
  return [...correct.map(text => choice(text, true)), ...wrong.map(text => choice(text, false))]
}

function freeAnswer(reference: string): Answer[] {
  return [choice(reference, true)]
}

function question(
  id: string,
  categoryId: string,
  value: QuestionValue,
  text: string,
  kind: QuestionKind,
  options: Answer[],
): Question {
  return { id, categoryId, value, text, kind, answers: options }
}

export const SEED_REVISION = 2

export function createSeedBank(): QuizBank {
  return {
    categories: [
      { id: 'cat-savanna', name: 'Саванна', order: 0 },
      { id: 'cat-cinema', name: 'Кино', order: 1 },
      { id: 'cat-planet', name: 'Планета', order: 2 },
      { id: 'cat-science', name: 'Наука', order: 3 },
    ],
    questions: [
      question('q-sav-100', 'cat-savanna', 100, 'Какое животное называют «царём зверей»?', 'single', singleAnswers('Лев', 'Тигр', 'Гепард', 'Леопард')),
      question('q-sav-200', 'cat-savanna', 200, 'Кто из больших кошек самый быстрый?', 'single', singleAnswers('Гепард', 'Леопард', 'Пума', 'Ягуар')),
      question('q-sav-300', 'cat-savanna', 300, 'Какие из этих животных — большие кошки?', 'multi', multiAnswers(['Лев', 'Ягуар'], ['Гиена', 'Шакал'])),
      question('q-sav-400', 'cat-savanna', 400, 'Где обитает снежный барс?', 'single', singleAnswers('Горы Центральной Азии', 'Саванны Африки', 'Амазония', 'Австралия')),
      question('q-sav-500', 'cat-savanna', 500, 'Назовите двух африканских хищников из семейства кошачьих.', 'free', freeAnswer('Лев и леопард. Также подходят гепард, сервал, каракал.')),
      question('q-sav-600', 'cat-savanna', 600, 'Какие утверждения про гепарда верны?', 'multi', multiAnswers(['Не умеет рычать', 'Самый быстрый на суше'], ['Живет стаями как львы', 'Относится к роду Panthera'])),
      question('q-sav-700', 'cat-savanna', 700, 'Почему гепарда не относят к роду Panthera?', 'free', freeAnswer('У гепарда другие голосовые связки: он не рычит, а мурлычет. Род — Acinonyx.')),

      question('q-cin-100', 'cat-cinema', 100, 'Кто снял фильм «Титаник»?', 'single', singleAnswers('Джеймс Кэмерон', 'Стивен Спилберг', 'Кристофер Нолан', 'Ридли Скотт')),
      question('q-cin-200', 'cat-cinema', 200, 'Какие фильмы снял Кэмерон?', 'multi', multiAnswers(['Титаник', 'Аватар'], ['Начало', 'Матрица'])),
      question('q-cin-300', 'cat-cinema', 300, 'В каком фильме звучит фраза «Я буду обратно»?', 'single', singleAnswers('Терминатор', 'Робокоп', 'Хищник', 'Чужой')),
      question('q-cin-400', 'cat-cinema', 400, 'Кратко: кто такой Фродо и что он несёт?', 'free', freeAnswer('Хоббит, хранитель Кольца Всевластья во «Властелине колец».')),
      question('q-cin-500', 'cat-cinema', 500, 'Какие из этих картин снял Тарантино?', 'multi', multiAnswers(['Криминальное чтиво', 'Бешеные псы'], ['Бойцовский клуб', 'Начало'])),
      question('q-cin-600', 'cat-cinema', 600, 'Кто сыграл Джокера в «Тёмном рыцаре»?', 'single', singleAnswers('Хит Леджер', 'Хоакин Феникс', 'Джек Николсон', 'Джаред Лето')),
      question('q-cin-700', 'cat-cinema', 700, 'Почему Ваканду часто сравнивают с утопией?', 'free', freeAnswer('Скрытая африканская страна с вибраниумом и высокой технологией при сохранённых традициях.')),

      question('q-pln-100', 'cat-planet', 100, 'Столица Франции?', 'single', singleAnswers('Париж', 'Лион', 'Марсель', 'Ницца')),
      question('q-pln-200', 'cat-planet', 200, 'Какие страны стоят на Апеннинском полуострове?', 'multi', multiAnswers(['Италия', 'Сан-Марино'], ['Греция', 'Португалия'])),
      question('q-pln-300', 'cat-planet', 300, 'На каком континенте находится Сахара?', 'single', singleAnswers('Африка', 'Азия', 'Австралия', 'Южная Америка')),
      question('q-pln-400', 'cat-planet', 400, 'Почему столицу Австралии путают с Сиднеем?', 'free', freeAnswer('Столица — Канберра. Сидней больше и известнее, поэтому его часто принимают за столицу.')),
      question('q-pln-500', 'cat-planet', 500, 'Какой океан самый большой?', 'single', singleAnswers('Тихий', 'Атлантический', 'Индийский', 'Северный Ледовитый')),
      question('q-pln-600', 'cat-planet', 600, 'Какие реки обычно называют самыми длинными?', 'multi', multiAnswers(['Нил', 'Амазонка'], ['Темза', 'Сена'])),
      question('q-pln-700', 'cat-planet', 700, 'Что считают высочайшей горой над уровнем моря и почему не К2?', 'free', freeAnswer('Эверест / Джомолунгма — выше над уровнем моря. К2 ниже, хотя маршрут сложнее.')),

      question('q-sci-100', 'cat-science', 100, 'Сколько планет в Солнечной системе после исключения Плутона?', 'single', singleAnswers('8', '7', '9', '10')),
      question('q-sci-200', 'cat-science', 200, 'Какие из этих тел — планеты Солнечной системы?', 'multi', multiAnswers(['Юпитер', 'Марс'], ['Плутон', 'Церера'])),
      question('q-sci-300', 'cat-science', 300, 'Что измеряет термометр?', 'single', singleAnswers('Температуру', 'Давление', 'Влажность', 'Скорость')),
      question('q-sci-400', 'cat-science', 400, 'Объясните, почему луна кажется больше у горизонта.', 'free', freeAnswer('Лунная иллюзия: мозг сравнивает диск с земными предметами у горизонта, а не оптика телескопа.')),
      question('q-sci-500', 'cat-science', 500, 'Какие величины — единицы СИ?', 'multi', multiAnswers(['Метр', 'Секунда'], ['Лошадиная сила', 'Калория'])),
      question('q-sci-600', 'cat-science', 600, 'Какой газ растения выделяют на свету?', 'single', singleAnswers('Кислород', 'Азот', 'Углекислый газ', 'Гелий')),
      question('q-sci-700', 'cat-science', 700, 'Зачем в сиде есть свободный вопрос: что должен сделать ведущий?', 'free', freeAnswer('Сравнить формулировки игроков с эталоном и начислить очки самым близким ответам.')),
    ],
  }
}
