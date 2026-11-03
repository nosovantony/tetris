# Staging: рейтинговый режим

Тестовая версия: **https://tetris-web-staging.nosov-antony.workers.dev**.

Это публичное тестовое окружение, не production. Данные могут быть удалены при
будущих тестах; стабильность и сохранность рекордов не обещаются. После гидратации
показывается STAGING-предупреждение. API/SSR-ответы имеют
`X-Marathon-Environment: staging` и `X-Robots-Tag: noindex, nofollow`; статические
assets могут обслуживаться напрямую. Это не защита доступа или гарантия отсутствия
индексации. Cloudflare Access/логин не настроены.

## Изоляция

- `tetris-web-staging` использует Service Binding только на `tetris-backend-staging`.
- Backend staging не имеет workers.dev, preview URL или routes.
- SQLite namespaces `LeaderboardDO` и `ValidationDO` отличны от production.
- Rate-limit namespace `15026061103` отличается от production `15026061102`.
- Случайный 256-битный `RUN_SIGNING_KEY` установлен только как backend Secret:
  сгенерирован локально, передан Wrangler через stdin, без вывода/записи в git.
- Cookie host-only; IndexedDB и Web Locks разделены по origin. Staging и
  production не разделяют guest identity, токены или браузерные сохранения.
- Free-квоты аккаунта общие: раздельные ресурсы не дают отдельного бесплатного
  бюджета. Платный план/лимиты, DNS и домены не менялись.

Wrangler `--env staging` использует явные имена и non-inheritable bindings.
DO без `script_name` принадлежат staging backend. Migrations v1/v2 создают два
SQLite-compatible класса именно в нём. Строка API binding `environment: production`
обозначает основной environment **скрипта `tetris-backend-staging`**, не `tetris-backend`.

Изоляция подтверждена API Cloudflare:
[resource-verification.json](staging/2026-11-03/resource-verification.json).

## Проверено 2026-11-03

Результаты: [smoke-results.json](staging/2026-11-03/smoke-results.json).
UTC timestamps относятся к предыдущему календарному дню.

1. web → Service Binding → закрытый backend → SQLite health;
2. выдача HMAC run со случайным seed и Secure/HttpOnly/SameSite=Strict cookie;
3. отклонение cross-origin, гостя без cookie и поддельной подписи;
4. action-only терминальная партия со штатным seed, серверный пересчёт и запись;
5. игнорирование добавленных клиентом score/lines/level;
6. повторная отправка с duplicate receipt, без дублирования результата;
7. профиль `private, no-store`, анонимный профиль без чужого результата;
8. общий топ с подтверждённым результатом и Cache API HIT без cookie/ID;
9. отклонение oversized JSON и повреждённого replay;
10. Chromium desktop и эмуляция Pixel 7: игра, пауза, IndexedDB reload,
    восстановление, готовый replay после reload, UI-отправка и личный рекорд.

HMAC, wall-time проверка и случайный seed не отключались. Архивный winning fixture
с seed 42 нельзя отправлять под случайный новый токен. Полный марафон и трёхчасовые
replay проверены отдельно в изолированном DO probe —
[отчёт](measurements/2026-11-03/REPORT.md). Staging smoke пишет только короткие
синтетические результаты, не выдавая их за длинные игры.

Это не physical-device/WebKit, нагрузочный тест или worst-case CPU benchmark.
CPU-поля tail отсутствовали; GraphQL-метрики вернули 401. Эти ограничения остаются.

## Зафиксированные версии

- web staging: `e89170fe-5e0c-41e6-bf04-3148880e6426`;
- backend staging после Secret: `97265a51-29f2-46a4-a0a0-3b819f00c1e0`;
- первоначальный backend до Secret: `845aea45-8160-4328-9a84-a7afce11c357`.

Production не обновлялся: web `7f3f11e2-8099-4103-88c5-8f209f52f2a6`, backend
`941f817e-0f12-46c9-b8f7-86f0ca18f475`; там остаётся тренировочная версия.
Проверка deployment API зафиксирована в resource-verification.

## Повторный выпуск и smoke

Только с разрешением на облачный выпуск, из корня проекта:

```sh
npm run check
npm run lint
npm test
npm run test:integration
npm run build
npm run test:e2e
npm run deploy:check:staging
npm run deploy:staging
npm run test:staging
```

CI выполняет dry-run staging, но не deploy и не сетевой smoke. `test:staging`
жёстко привязан к staging URL: он пишет синтетические результаты. Cookie/токены
не сохраняются в отчёте. Возможна одна пауза 31 с для устаревшего топа, без обхода
canonical cache key. История тестов может заполнить топ: перед множеством повторов
нужен осознанный reset тестового окружения, не удаление production-данных.

Обычный `deploy:staging` сохраняет Secret. Ротация требует нового случайного ключа
через защищённый stdin `wrangler secret put RUN_SIGNING_KEY --config workers/backend/wrangler.jsonc --env staging`.
Замена единственного ключа инвалидирует cookie/ticket. Не использовать локальный
или staging-ключ в production.

Production требует отдельного разрешения, отдельного случайного Secret и
backend-first migration v2. Staging не переводится в production сменой binding;
тестовые рекорды не копируются. До широкого выпуска остаются дополнительные
тяжёлые replay/seed, CPU-телеметрия и оценка суточных квот.
