# Самонастройваща се инсталация (PostgreSQL provisioning)

## Проблем

Приложението очаква вече наличен локален PostgreSQL сървър на `localhost:5432` с фиксирани credentials, вкарани в `.env` и `electron/db/setup.sql`. При инсталация на нов компютър логинът се проваля, защото:

1. PostgreSQL не е инсталиран на новата машина.
2. Базата/схемата/ролята не са създадени (`setup.sql` трябва да се изпълни ръчно с `psql`).
3. Няма нито един ред в таблица `users` — акаунти се вкарват само ръчно в базата (умишлено, за да няма self-registration през UI).

## Решение — обобщено

Всеки компютър пази **собствена, независима PostgreSQL база** (потвърдено с потребителя — няма централен сървър). Вместо ръчна настройка, **приложението само се провижнира при първо стартиране**:

- Инсталаторът (NSIS/electron-builder) си остава прост — само копира файловете на приложението, точно както сега.
- PostgreSQL Windows инсталаторът (EDB, pinned версия, Windows x64) се **сваля еднократно по време на `npm run dist`** (build time, на машината на разработчика) и се вгражда в получения `.exe` чрез `extraResources`. Готовият продукт работи офлайн на всеки клиентски компютър — не зависи от мрежата там.
- При първо стартиране на приложението, ако локална конфигурация/база липсва, вместо екрана за логин се показва **Setup Wizard**, който:
  1. Открива дали вече има работещ локален PostgreSQL; ако не — тихо инсталира вградения (генерирана случайна superuser парола), което изисква един UAC prompt.
  2. Създава роля `napoyavane_app` (случайна парола), база `napoyavane` и таблиците (сегашният `setup.sql`, параметризиран).
  3. Генерира случаен `JWT_SECRET` и записва всичко в `%APPDATA%\napoyavane-htr-yambol\config.env`.
  4. Показва форма за създаване на **първия администраторски акаунт** (username + парола) — работи еднократно, докато `users` е празна.
  5. Пренасочва към обичайния екран за логин.

Тайните (DB парола, JWT_SECRET) вече се генерират случайно за всяка машина — не стоят фиксирани в git репото.

## Компоненти

### `electron/provision.cjs` (нов файл)
Цялата provisioning логика, извикана от `main.cjs`:
- `detectPostgres()` — проверява service/порт 5432 за съществуващ PostgreSQL.
- `installPostgresSilently(superuserPassword)` — стартира вградения инсталатор в unattended режим (`--mode unattended --superpassword ... --serverport 5432`), изчаква завършване. Тук идва UAC prompt-ът.
- `provisionDatabase({ superuserPassword, appPassword })` — свързва се като `postgres` (superuser), изпълнява генериран SQL: `CREATE ROLE napoyavane_app ...`, `CREATE DATABASE napoyavane ...`, таблиците от досегашния `setup.sql`. Паролата се инжектира параметризирано/безопасно escape-ната (не directly string-interpolation в SQL literal без escaping).
- `writeConfig({ dbPassword, jwtSecret })` — пише `config.env` в `app.getPath('userData')`.
- `readConfig()` / `isProvisioned()` — за idempotent проверки при рестарт по средата на процеса.

Всяка стъпка проверява дали вече е свършена (роля съществува? база съществува? таблици съществуват? config.env го има?) преди да я направи наново — provisioning понася прекъсване (сън на компютъра, прекъснат процес) и продължава оттам, докъдето е стигнал.

### `electron/db/setup.sql`
Остава като fallback документация/ръчен път (за edge case-а по-долу), но provisioning логиката генерира еквивалентния SQL програмно в `provision.cjs`, за да инжектира случайно генерираната парола безопасно.

### `electron/main.cjs`
- При стартиране: `isProvisioned()` → ако `false`, рендерира wizard state вместо да отваря `pool` веднага.
- `pool` вече не се създава на module-load с `process.env.DATABASE_URL` от фиксиран `.env` — създава се лениво, след като `config.env` съществува (чете се вместо/в допълнение на build-time `.env`).
- Нови IPC handler-и:
  - `setup:status` → връща `{ provisioned: boolean, hasAdmin: boolean, step, error? }`.
  - `setup:runProvisioning` → тригерва стъпки 1–3 по-горе, emit-ва прогрес събития към renderer-а за индикация в UI.
  - `auth:bootstrapAdmin(username, password)` → **guard: работи само ако `SELECT count(*) FROM users` е 0** — създава първия ред, hash-нат с bcrypt, връща token (auto-login след wizard-а). Съществуващият коментар "No auth:register" се допълва, за да обясни защо този bootstrap handler не е same-thing като self-registration (еднократен, само при празна таблица).

### `electron/preload.cjs`
Expose-ва `setupStatus`, `runProvisioning` (с progress callback/listener), `bootstrapAdmin` към `window.api`.

### `src/` (renderer)
- Нов компонент `SetupWizard` (или подпапка `src/setup/`) с две стъпки:
  1. Прогрес екран за база данни (poll/listen на `setup:runProvisioning` прогрес; показва грешки на български с бутон "Опитай пак").
  2. Форма за първи admin (username, парола, потвърждение на парола).
- `App.tsx` — при mount, вика `setup:status`; ако `!provisioned || !hasAdmin`, рендерира `SetupWizard` вместо обичайния login route.

### Build/packaging
- Нов npm скрипт `fetch-postgres-installer` (Node или PowerShell): сваля pinned EDB Windows x64 installer (конкретна версия, sha256 проверка) в `vendor/postgresql-installer.exe`, ако липсва.
- `package.json` → `build.extraResources` добавя `{ "from": "vendor/postgresql-installer.exe", "to": "postgresql-installer.exe" }`.
- `package.json` → `scripts.dist` извиква `fetch-postgres-installer` преди `electron-builder`.
- `.gitignore` → `vendor/` (голям бинарен файл не влиза в git).
- `.env` / `electron/db/setup.sql` — фиксираните стойности вътре стават единствено пример/dev fallback (dev режим на `npm run electron` без provisioning продължава да ползва локалния `.env`, ако вече съществува, за да не чупим текущия dev workflow).

## Edge cases и обработка на грешки

| Случай | Поведение |
|---|---|
| PostgreSQL вече инсталиран от друг софтуер на машината | `detectPostgres()` го открива; wizard-ът показва поле за ръчно въвеждане на съществуващата superuser парола вместо да инсталира втори инстанс. |
| Порт 5432 зает | Ясна грешка на български + предложение да се провери какво слуша на порта; бутон "Опитай пак". |
| Потребителят отказва UAC prompt-а | Wizard спира на стъпка 1, показва обяснение защо е нужен админ достъп, бутон "Опитай пак". |
| Прекъсване по средата (сън, убит процес) | Idempotent проверки при следващо стартиране продължават от последната завършена стъпка. |
| `npm run electron` / `npm run app` (dev, без пакетиран инсталатор) | Ако `.env` вече съществува локално (dev машина), провижнирането се прескача изцяло — dev workflow-ът не се променя. |

## Извън обхвата

- Миграция на съществуващи инсталации с фиксираните стари credentials — не е засегната от тази промяна (само нови инсталации минават през wizard-а).
- UI/UX финален дизайн на wizard екраните (стилизация) — ще следва съществуващия Tailwind стил на приложението, без отделна spec тук.
- Тест на реална "чиста" Windows машина с UAC — не може да се автоматизира от агента; изисква ръчна проверка от потребителя върху финалния инсталатор.

## Тестване

- Unit-тестваема логика в `provision.cjs` (detect/idempotency проверки) чрез мокване на `child_process` и `pg` connection.
- Локална симулация: тестова роля/база с различно име, за да се провери целият path без да се пипа реалната dev база.
- Финална проверка: потребителят пуска `npm run dist` инсталатора на чист (или снапшотнат) Windows компютър и потвърждава, че логин wizard-ът минава от край до край.
