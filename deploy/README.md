# Развёртывание

Приложение использует Node.js 22.23+ и постоянный файл SQLite. Для публичного адреса настройте HTTPS, задайте `SESSION_SECRET` и запустите один экземпляр приложения на файловом томе. Контейнер и Compose используют системные часы и московскую календарную зону кабинета.

## Docker Compose

Выполните из корня проекта. Вместо аргументов `admin` и `Администратор` можно указать свои логин и имя.

```sh
export SESSION_SECRET="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')"
docker compose -f deploy/compose.yaml up --build -d
docker compose -f deploy/compose.yaml exec deanery node deploy/create-admin.mjs admin 'Администратор'
curl -fsS http://127.0.0.1:3000/health
```

Привяжите домен к HTTPS-прокси, который направляет запросы на `127.0.0.1:3000`. Сгенерированный пароль показывается один раз. Сохраните его и откройте `/office/login` по адресу с HTTPS. Храните `SESSION_SECRET` в секретах хостинга и используйте то же значение при следующих запусках.

Docker копирует исходный `data/production.sqlite` в новый том `deanery-data`. Существующий том сохраняет свои данные. Приложение применяет миграции при открытии базы. Сервис отвечает `200 ok` на `/health` до входа.

Для прямого Docker-запуска контекст сборки — корень репозитория, Dockerfile — `deploy/Dockerfile`. Приложение слушает `0.0.0.0:3000`, путь постоянного тома — `/data`.

## Node.js на сервере

```sh
npm ci --omit=dev
mkdir -p var
cp -n data/production.sqlite var/production.sqlite
export DEANERY_DB="$PWD/var/production.sqlite"
export NODE_ENV=production SCHOOL_CLOCK=real HOST=127.0.0.1 PORT=3000
export SESSION_SECRET="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')"
node deploy/create-admin.mjs admin 'Администратор'
npm start
```

Для хостинга с собственным адресом и портом подставьте значения платформы в `HOST`, `PORT` и `DEANERY_DB`. После первого запуска сверяйте `/health` и вход администратора по HTTPS. Для резервной копии остановите приложение, скопируйте рабочий файл SQLite и запустите приложение снова.
