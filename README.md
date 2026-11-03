<img src="assets/icon.svg" width="64" height="64" alt="">

# Marathon 150

Браузерный векторный тетрис: Svelte 5, SvelteKit, TypeScript и Cloudflare Workers Free.

**[Играть онлайн](https://tetris-web.nosov-antony.workers.dev)** — SVG-поле,
клавиатура, мобильный джойстик, Hold, очередь, пауза и тренировка с уровня 1–150.
Незавершённая партия автоматически сохраняется в IndexedDB этого браузера
и восстанавливается на паузе.

В рабочей версии кода добавлен режим **«Рейтинг»** с HMAC-сессией и серверной
проверкой replay в отдельном Durable Object, Cache API и личным рекордом.
Рейтинговая версия опубликована только в **[отдельном staging](https://tetris-web-staging.nosov-antony.workers.dev)**;
production пока остаётся тренировкой. Staging содержит тестовые рекорды и может
очищаться. Настройка и ограничения — [STAGING.md](docs/STAGING.md) и
[RUN-PROTOCOL.md](docs/RUN-PROTOCOL.md).

```sh
npm ci
npm run dev
```

Откройте http://127.0.0.1:5173. Оба Worker запускаются одной командой локально,
без Cloudflare-аккаунта. Требуется Node.js 24 LTS.

- [Разработка, команды и архитектура](docs/DEVELOPMENT.md)
- [Правила и API движка](docs/GAME-RULES.md)
- [План реализации](docs/PLAN.md)
- [Первый выпуск в Cloudflare](docs/DEPLOYMENT.md)
- [Результаты облачных измерений](docs/measurements/2026-11-02/CLOUD-REPORT.md)
- [Полный марафон и длинные replay в Cloudflare](docs/measurements/2026-11-03/REPORT.md)

```sh
npm run check
npm test
npm run test:integration
npm run build
npx playwright install chromium
npm run test:e2e
```

Создано в [T3 Code](https://t3.codes).
