package whoami

var Deck = []CardDef{
	{ID: "w-1", Text: "Эйнштейн"},
	{ID: "w-2", Text: "Клеопатра"},
	{ID: "w-3", Text: "Гарри Поттер"},
	{ID: "w-4", Text: "Наполеон"},
	{ID: "w-5", Text: "Мэрилин Монро"},
	{ID: "w-6", Text: "Шерлок Холмс"},
	{ID: "w-7", Text: "Бэтмен"},
	{ID: "w-8", Text: "Фрейд"},
	{ID: "w-9", Text: "Лев Толстой"},
	{ID: "w-10", Text: "Человек-паук"},
	{ID: "w-11", Text: "Пикассо"},
	{ID: "w-12", Text: "Дарт Вейдер"},
	{ID: "w-13", Text: "Чарли Чаплин"},
	{ID: "w-14", Text: "Джоконда"},
	{ID: "w-15", Text: "Винни-Пух"},
	{ID: "w-16", Text: "Царь Пётр I"},
	{ID: "w-17", Text: "Йода"},
	{ID: "w-18", Text: "Жанна д’Арк"},
	{ID: "w-19", Text: "Супермен"},
	{ID: "w-20", Text: "Агата Кристи"},
	{ID: "w-21", Text: "Чебурашка"},
	{ID: "w-22", Text: "Илон Маск"},
	{ID: "w-23", Text: "Моцарт"},
	{ID: "w-24", Text: "Кот в сапогах"},
}

type CardDef struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}
