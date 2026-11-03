# Выпуск в Cloudflare — 2026-11-03

В production развёрнута полная версия игры: **режим тренировки (1–150 уровней) и рейтинговый режим**
с криптографической HMAC-сессией, серверной валидацией replay через отдельный `ValidationDO`,
атомарным сохранением рекордов в SQLite `LeaderboardDO`, Edge Cache API и приватным профилем игрока.

Адрес игры: **https://tetris-web.nosov-antony.workers.dev**.

Развёрнуты два Worker:

- `tetris-backend`: без workers.dev, preview URL и публичных routes; экспортирует
  `LeaderboardDO` (SQLite migration `v1`) и `ValidationDO` (SQLite migration `v2`).
  Установлен production-секрет `RUN_SIGNING_KEY`. Доступ только через закрытый Service Binding.
  Текущая версия backend: `fa2c8389-2a01-430c-b312-ed0f0064139c`.
- `tetris-web`: статические векторные ресурсы и SvelteKit API; Service Binding `BACKEND`
  ведёт на `tetris-backend`.
  Текущая версия web: `337947cd-5bea-4a4e-8e8a-214bccf0d128`.
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
