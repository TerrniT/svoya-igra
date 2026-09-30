package text

import (
	"errors"
	"fmt"
)

func Error(message string) error {
	return errors.New(message)
}

func Errorf(format string, args ...any) error {
	return fmt.Errorf(format, args...)
}

const (
	BadMessage         = "Некорректное сообщение"
	HostStarts         = "Только ведущий начинает игру"
	GameNotStarted     = "Игра ещё не началась"
	UnknownGameMessage = "Неизвестное сообщение игры"
	NeedOnePlayer      = "Нужен хотя бы один игрок"
	NeedOneParticipant = "Нужен хотя бы один участник"
	NeedTwoPlayers     = "Нужно минимум двое игроков"
	PlayerMissing      = "Игрок не найден"
	PlayerNotInRoom    = "Этого игрока нет среди участников"
	HostNameRequired   = "Введите имя ведущего"
	PlayerNameRequired = "Введите имя"
	DeviceRequired     = "Нет идентификатора устройства"
	LeaveRoomFirst     = "Сначала выйдите из комнаты"
	JoinRoomFirst      = "Сначала войдите в комнату"
	RoomClosed         = "Комната уже закрыта"
	RoomCreateFailed   = "Не удалось создать комнату"
	RoomCodeBusy       = "Не удалось подобрать код комнаты"
	RoomMissing        = "Комната не найдена. Проверьте код."
	ReconnectFailed    = "Не удалось переподключиться. Войдите по коду ещё раз."
	KickHostOnly       = "Только ведущий удаляет игроков"
	KickHostForbidden  = "Ведущего удалить нельзя"
	Kicked             = "Вас удалили из комнаты"
	UnknownGame        = "Неизвестная игра: %s"
)
