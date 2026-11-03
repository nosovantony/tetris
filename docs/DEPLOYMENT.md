# Выпуск в Cloudflare — 2026-11-02

Этот документ описывает уже опубликованную тренировку. Новая рабочая реализация
рейтинга с HMAC/ValidationDO опубликована **только в отдельном staging** —
[STAGING.md](STAGING.md); production не обновлялся. Контракт нового выпуска —
в [RUN-PROTOCOL.md](RUN-PROTOCOL.md). Миграция `v2` добавляет только ValidationDO
и не изменяет/удаляет существующий namespace LeaderboardDO.

Адрес игры: **https://tetris-web.nosov-antony.workers.dev**.

Развёрнуты два Worker:

- `tetris-backend`: без workers.dev, preview URL и публичных routes; экспортирует
  `LeaderboardDO` с SQLite-миграцией `v1`. Доступ только через Service Binding.
- `tetris-web`: статические ресурсы и SvelteKit API; Service Binding `BACKEND`
  ведёт на `tetris-backend`.

Первый выпуск backend: `941f817e-0f12-46c9-b8f7-86f0ca18f475`.
Текущий web: `7f3f11e2-8099-4103-88c5-8f209f52f2a6`.
Версии последующих выпусков можно посмотреть через `wrangler deployments list`.

## Повторный ручной выпуск

Только с разрешением на публикацию, из корня проекта:

```sh
npm ci
npm run check
npm run lint
npm test
npm run test:integration
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:smoke:built
npm run deploy:check
npx wrangler deploy --config workers/backend/wrangler.jsonc
npx wrangler deploy
```

Выпуск backend должен завершиться успешно до публикации web. Не добавлять backend
публичный маршрут. CI выполняет проверки, но не production-деплой.
Production и staging имеют разные Worker, DO namespaces и ключи; сохранять эту изоляцию.

## Границы текущего выпуска

- Игра — локальная тренировка, без серверной регистрации партий и отправки очков.
- Индивидуальное автосохранение находится в браузере, не в Cloudflare SQLite.
- `/api/health` проверяет реальную цепочку web → backend → SQLite.
- `/api/leaderboard` читает реальную таблицу; тестовых результатов в облако не добавляли.
- `POST /api/runs/finish` отсутствует (404); backend `/results` не проксируется.
- Публичный рейтинг пока не кэшируется: API возвращает `no-store`.
- Платные опции, подписка, домены и DNS не менялись. Использованы стандартные
  Workers и SQLite DO, доступные в Free; платных зависимостей не добавлено.
  Ранее API подписок возвращал 403: независимого подтверждения биллинга через API
  нет. Это не гарантия неограниченного бесплатного трафика: квоты Free сохраняются.

После публикации проверены HTTP 200 для `/`, `/leaderboard`, `/api/health`,
`/api/leaderboard`, SQLite schema v1 и HTTP 404 для публичной отправки результатов.
На опубликованном сайте также выполнены Chromium-проверки desktop и Pixel 7:
старт партии, hard drop, автосохранение IndexedDB, перезагрузка с восстановлением
на паузе и отсутствие ошибок страницы. В production записывалось только браузерное
сохранение тестового контекста; результаты в рейтинг не отправлялись.

Перед выпуском прошли 121 модульный тест, 24 браузерных сценария
(ещё два touch-only случая пропущены на desktop), SQLite integration, built-Worker
smoke, check, lint, build и dry-run. Полная партия Marathon 150 и её облачная
серверная валидация этими проверками не подтверждаются.
