# xray-orchestrator

Telegram-бот для управления ключами Xray: создание, удаление, выдача ссылок. Построен на шаблоне [nestjs-template](https://github.com/HUAYUN-vision/nestjs-template).

## Стек

- **NestJS 12** + **TypeScript 6** (strict)
- **grammY** — Telegram Bot API (long polling в dev, webhook в prod)
- **ESLint 10** (flat config, type-checked) + **Prettier**
- **Husky** + **lint-staged** + **commitlint** (Conventional Commits)
- **@nestjs/config** + **zod** — валидация env при старте
- **nestjs-pino** — структурные JSON-логи (pretty в dev)
- **@nestjs/terminus** — `/health/live`, `/health/ready`
- **Swagger** — `/docs` (включается `SWAGGER_ENABLED=true`)
- **helmet**, CORS, глобальный `ValidationPipe`, URI-версионирование (`/api/v1/...`)
- Глобальный exception filter с единым форматом ошибок
- **Jest** (unit + e2e), Docker (multi-stage, non-root, healthcheck), GitHub Actions CI, Dependabot

## Telegram

| Переменная       | Описание                                                          |
| ---------------- | ----------------------------------------------------------------- |
| `BOT_TOKEN`      | токен от @BotFather, обязателен                                   |
| `BOT_MODE`       | `polling` (по умолчанию) или `webhook`                            |
| `WEBHOOK_URL`    | https-адрес вебхука, например `https://host/api/telegram/webhook` |
| `WEBHOOK_SECRET` | секрет для заголовка `X-Telegram-Bot-Api-Secret-Token`            |

`WEBHOOK_URL` и `WEBHOOK_SECRET` обязательны при `BOT_MODE=webhook`. Вебхук принимается на `POST /{GLOBAL_PREFIX}/telegram/webhook`, в режиме polling этот путь отвечает 404.

## Требования

Node.js **24.9+** (см. `.nvmrc`). Nest 12 поставляется как ESM, а Jest грузит его через нативный `require(esm)`, который есть только в Node 24.9+.

## Быстрый старт

```bash
nvm use
npm install
cp .env.example .env
npm run start:dev
```

## Скрипты

| Скрипт                               | Описание                       |
| ------------------------------------ | ------------------------------ |
| `npm run start:dev`                  | запуск в watch-режиме          |
| `npm run build`                      | сборка в `dist/`               |
| `npm run start:prod`                 | запуск сборки                  |
| `npm run lint` / `lint:check`        | ESLint с автофиксом / проверка |
| `npm run format` / `format:check`    | Prettier                       |
| `npm run typecheck`                  | `tsc --noEmit`                 |
| `npm test` / `test:e2e` / `test:cov` | тесты                          |

## Git-хуки

- `pre-commit` → `lint-staged` (eslint + prettier на изменённых файлах, typecheck при изменении `.ts`)
- `commit-msg` → `commitlint` (`feat: ...`, `fix(scope): ...`, `chore: ...`)

## Структура

```
src/
├── common/filters/     # глобальные фильтры, guards, interceptors
├── config/             # схема env (zod) и типизированный AppConfigService
├── modules/health/     # health-check
├── telegram/           # бот: lifecycle, webhook, хендлеры, обёртки Bot API 10.4 (виджеты)
├── app.module.ts
├── setup-app.ts        # общая настройка приложения (main + e2e)
└── main.ts
test/                   # e2e-тесты
```

## Использование как шаблона

> Не используйте кнопку **Use this template** на GitHub. Она создаёт репозиторий без общей истории с шаблоном, и подтягивать обновления потом придётся через `--allow-unrelated-histories` с конфликтами почти во всех файлах. Клонируйте шаблон с историей, тогда обновления вливаются обычным `git merge`.

### Старт нового проекта

```bash
# 1. Создайте пустой репозиторий на GitHub (без README/.gitignore), например HUAYUN-vision/my-service

# 2. Клон шаблона с историей
git clone https://github.com/HUAYUN-vision/nestjs-template.git my-service
cd my-service

# 3. Шаблон становится remote "template", а origin указывает на новый репозиторий
git remote rename origin template
git remote add origin https://github.com/HUAYUN-vision/my-service.git

# 4. ВАЖНО: не тянуть теги шаблона
git config remote.template.tagOpt --no-tags
git tag -l | xargs git tag -d

# 5. Настройка под проект (см. ниже), затем
git commit -am "chore: init my-service from nestjs-template"
git push -u origin main
```

**Почему без тегов.** Версия считается от последнего тега `vX.Y.Z` (`git describe --tags`). Если теги шаблона попадут в проект, он «унаследует» чужую версию, а релиз может упасть на уже существующем теге.

Что поменять в новом проекте:

1. `package.json`: `name`, `description`, `"version": "0.0.0"`.
2. `README.md`, `docker-compose.yml` (имена сервисов и образов), `.env.example`.
3. Новые переменные окружения добавляйте в `src/config/env.validation.ts` и `.env.example`.
4. Проверки БД / Redis / внешних сервисов добавляйте в `HealthController.ready()`.

### Как подтягивать изменения из шаблона

```bash
git fetch template
git checkout -b chore/sync-template
git merge template/main
# разрешить конфликты, затем:
npm install          # пересобрать lock, если конфликтовал package-lock.json
npm run build && npm test
git push -u origin chore/sync-template   # и открыть PR
```

Заголовок PR: `chore: sync with nestjs-template`, тогда релиз не выпускается. Если в шаблоне был важный фикс, ставьте `fix: ...`, тогда выйдет patch-релиз.

Типичные конфликты:

- **`package.json` → `version`, `name`**: всегда оставляйте значения проекта. Шаблон сам делает коммиты `chore(release): vX.Y.Z`, поэтому версия конфликтует при каждом мердже.
- **`package-lock.json`**: не правьте руками. Возьмите любую сторону и выполните `npm install`.
- **Зависимости**: dependabot обновляет их и в шаблоне, и в проекте. Берите более новую версию.

### Как уменьшить число конфликтов

- Держите общее в шаблоне, а специфичное для проекта в отдельных файлах и модулях. Чем реже проект меняет «шаблонные» файлы (`eslint.config.mjs`, `tsconfig*`, `Dockerfile`, `.github/`, `src/main.ts`, `src/setup-app.ts`), тем проще мердж.
- CI вынесен в [`HUAYUN-vision/ci-cd-workflows`](https://github.com/HUAYUN-vision/ci-cd-workflows) (`@v1`), так что улучшения пайплайна доходят до проектов без мерджа. Конфиг Dependabot синхронизирует workflow `dependabot-sync.yml`: раз в неделю он открывает PR.
- Синхронизируйтесь регулярно: несколько мелких мерджей проще одного большого раз в полгода.
