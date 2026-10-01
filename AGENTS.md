# [AGENTS.md](http://AGENTS.md)

Монорепозиторий партийных игр: фронт в `frontend/`, комнаты в `backend/`. Игровой reducer живёт на сервере. Новую игру добавляют модулем, не правя хаб.

## Запуск

Основной способ:

```bash
cp -n .env.example .env
docker compose up --build
```

- UI: [http://localhost](http://localhost) (`FRONTEND_PORT`, по умолчанию 80)
- бэкенд: [http://localhost:8080](http://localhost:8080) (`BACKEND_PORT`)
- WebSocket: тот же origin, что и UI (`/ws` проксируется nginx → backend)

На телефоне открывайте LAN-адрес машины (не `localhost`). QR берёт origin из `GET /api/join-info`. Если фронт открыт с localhost, сервер подставляет IPv4 LAN. Явный список:

```
JOIN_ORIGINS=http://192.168.1.10
```

Остановка: `Ctrl+C` или `docker compose down`.

### Переменные backend (`.env`)


| Переменная          | По умолчанию | Смысл                                       |
| ------------------- | ------------ | ------------------------------------------- |
| `HOST`              | `0.0.0.0`    | адрес listen                                |
| `PORT`              | `8080`       | порт listen внутри контейнера               |
| `WS_PATH`           | `/ws`        | путь WebSocket                              |
| `CORS_ORIGINS`      | `*`          | Origin для WS; `*` или список через запятую |
| `JOIN_ORIGINS`      | пусто        | origins для QR; пусто — из Host / LAN       |
| `MAX_MESSAGE_BYTES` | `1048576`    | лимит кадра WS                              |
| `READ_TIMEOUT`      | `60s`        | read deadline                               |
| `WRITE_TIMEOUT`     | `8s`         | write deadline                              |
| `PING_INTERVAL`     | `20s`        | ping                                        |


Проброс портов на хост: `FRONTEND_PORT`, `BACKEND_PORT`.

## Продакшен (VDS + Caddy)

На сервере Caddy слушает 80/443, фронт и бэкенд остаются во внутренней docker-сети. TLS — Let's Encrypt.

```bash
cp -n docker-compose.env.example docker-compose.env
# в docker-compose.env: EMAIL, при необходимости DOMAIN
docker compose -f docker-compose.prod.yml up -d --build
```

- сайт: `DOMAIN`
- `www.${DOMAIN}.ru` редиректит на apex
- `/ws` и `/api` проксирует Caddy → backend, остальное → frontend
- сертификаты в volume `caddy_data`

DNS: A (и при желании AAAA) для `DOMAIN` и `www.${DOMAIN}.ru` на IP VDS. Порты 80 и 443 должны быть открыты.

Другой хост — только `DOMAIN` / `CORS_ORIGINS` / `JOIN_ORIGINS` в `docker-compose.env`. Локальный стек (`docker compose up`) не меняется.

### Локально без Docker

Нужны Go 1.24+ и Node 22 / pnpm.

```bash
# терминал 1
cd backend
export $(grep -v '^#' ../.env.example | xargs)
go run ./cmd/server

# терминал 2
cd frontend
pnpm install
pnpm dev
```

Vite на `:5173` проксирует `/ws` и `/api` на `127.0.0.1:8080`.

E2E из `frontend/`: `pnpm test:e2e` (поднимает Go + Vite на 4173).

## Игры на бэкенде

Контракт: `backend/internal/gamekit` (`Module` + `Driver` + `settings` JSON).

Каталог: `backend/internal/games/catalog.go` — единственное место, которое знает список игр.

Чтобы добавить игру:

1. Пакет `backend/internal/games/<id>/` с `module.go` (ID, DefaultSettings, NormalizeSettings), `driver.go`, `text.go`.
2. Строка `MustRegister` в `catalog.go`.
3. Настройки комнаты приходят в `create.settings` и доступны в `Context.Settings`.

Общие тексты ошибок: `backend/internal/text`. Тексты конкретной игры — в её `text.go`.

Фронт шлёт настройки из лобби (`settings: { bank }`, `{ questions, category }`, …), composable `useRoom` ходит только в `frontend/src/api/rooms.ts`.