# Промежуточная версия «Учебный день»

21 ноября 2026 года. Этап 2 из 3: [`v0.2-intermediate`](https://github.com/anyvladdy/mgimo-deanery/releases/tag/v0.2-intermediate).

Портал получил дизайн-систему «Учебный день». На первом плане ближайшая пара, время и обе аудитории. Появились учебный план, силлабусы, история результатов и рабочий стол учебного офиса. Преподаватель видит назначенную ему ведомость.

[Главная «Учебного дня»](screenshots/study-day.png) · [Учебный офис](screenshots/office.png) · [Дизайн-система](docs/DESIGN-SYSTEM.md) · [Интерактивный HTML-образец](docs/design-components.html)

## Запуск

Из этой папки, с Node.js 22.23+.

```sh
npm ci
npm run demo:setup
npm run demo:office
npm start
```

Откройте [вход студента](http://127.0.0.1:3000/login) или [вход сотрудника](http://127.0.0.1:3000/office/login). Пароли выдаются при подготовке новых демо-аккаунтов. Данные хранятся в `var/deanery.sqlite` внутри этой версии.

`npm test` · 55 из 55.
