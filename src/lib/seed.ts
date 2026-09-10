import type { Answer, Question, QuestionValue, QuizBank } from '@/lib/types'

function answers(
  correct: string,
  ...wrong: string[]
): Answer[] {
  return [
    { id: `${correct}-ok`, text: correct, isCorrect: true },
    ...wrong.map((text, index) => ({
      id: `${text}-${index}`,
      text,
      isCorrect: false,
    })),
  ]
}

function question(
  id: string,
  categoryId: string,
  value: QuestionValue,
  text: string,
  options: Answer[],
): Question {
  return { id, categoryId, value, text, answers: options }
}

export function createSeedBank(): QuizBank {
  return {
    categories: [
      { id: 'cat-predators', name: 'Хищники', order: 0 },
      { id: 'cat-cinema', name: 'Кино', order: 1 },
      { id: 'cat-geo', name: 'География', order: 2 },
    ],
    questions: [
      question('q-pred-100', 'cat-predators', 100, 'Какое животное называют «царём зверей»?', answers('Лев', 'Тигр', 'Гепард', 'Леопард')),
      question('q-pred-200', 'cat-predators', 200, 'Кто из больших кошек самый быстрый?', answers('Гепард', 'Леопард', 'Пума', 'Ягуар')),
      question('q-pred-300', 'cat-predators', 300, 'Какой рисунок на шкуре у леопарда?', answers('Розетки', 'Полоски', 'Сплошные круги', 'Клетки')),
      question('q-pred-400', 'cat-predators', 400, 'Где обитает снежный барс?', answers('Горы Центральной Азии', 'Саванны Африки', 'Амазония', 'Австралия')),
      question('q-pred-500', 'cat-predators', 500, 'Как называется детёныш льва?', answers('Львёнок', 'Котёнок', 'Щенок', 'Ягнёнок')),
      question('q-pred-600', 'cat-predators', 600, 'Какая большая кошка не умеет рычать?', answers('Гепард', 'Лев', 'Тигр', 'Ягуар')),
      question('q-pred-700', 'cat-predators', 700, 'К какому роду относятся лев, тигр, леопард и ягуар?', answers('Panthera', 'Felis', 'Acinonyx', 'Lynx')),

      question('q-cin-100', 'cat-cinema', 100, 'Кто снял фильм «Титаник»?', answers('Джеймс Кэмерон', 'Стивен Спилберг', 'Кристофер Нолан', 'Ридли Скотт')),
      question('q-cin-200', 'cat-cinema', 200, 'Как зовут главного героя «Властелина колец», который несёт Кольцо?', answers('Фродо', 'Арагорн', 'Гэндальф', 'Сэм')),
      question('q-cin-300', 'cat-cinema', 300, 'В каком фильме звучит фраза «Я буду обратно»?', answers('Терминатор', 'Робокоп', 'Хищник', 'Чужой')),
      question('q-cin-400', 'cat-cinema', 400, 'Какой режиссёр снял «Криминальное чтиво»?', answers('Квентин Тарантино', 'Мартин Скорсезе', 'Дэвид Финчер', 'Братья Коэн')),
      question('q-cin-500', 'cat-cinema', 500, 'Как называется вымышленная страна в «Чёрной пантере»?', answers('Ваканда', 'Гондор', 'Нарния', 'Замония')),
      question('q-cin-600', 'cat-cinema', 600, 'Кто сыграл Джокера в «Тёмном рыцаре»?', answers('Хит Леджер', 'Хоакин Феникс', 'Джек Николсон', 'Харед Лето')),
      question('q-cin-700', 'cat-cinema', 700, 'Какой фильм первым получил «Оскар» за лучший фильм на иностранном языке из СССР?', answers('Война и мир', 'Летят журавли', 'Иваново детство', 'Андрей Рублёв')),

      question('q-geo-100', 'cat-geo', 100, 'Столица Франции?', answers('Париж', 'Лион', 'Марсель', 'Ницца')),
      question('q-geo-200', 'cat-geo', 200, 'Самая длинная река в мире?', answers('Нил', 'Амазонка', 'Янцзы', 'Миссисипи')),
      question('q-geo-300', 'cat-geo', 300, 'На каком континенте находится Сахара?', answers('Африка', 'Азия', 'Австралия', 'Южная Америка')),
      question('q-geo-400', 'cat-geo', 400, 'Какая страна имеет форму сапога?', answers('Италия', 'Греция', 'Португалия', 'Чили')),
      question('q-geo-500', 'cat-geo', 500, 'Какой океан самый большой?', answers('Тихий', 'Атлантический', 'Индийский', 'Северный Ледовитый')),
      question('q-geo-600', 'cat-geo', 600, 'Столица Австралии?', answers('Канберра', 'Сидней', 'Мельбурн', 'Брисбен')),
      question('q-geo-700', 'cat-geo', 700, 'Какая гора считается высочайшей на Земле над уровнем моря?', answers('Эверест', 'К2', 'Килиманджаро', 'Эльбрус')),
    ],
  }
}
