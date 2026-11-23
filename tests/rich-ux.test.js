import assert from 'node:assert/strict';
import { test } from 'node:test';
import { disciplinePath, fixture } from './support/app-fixture.js';

test('полная главная показывает день целиком и два следующих дня, новости и быстрый доступ', async t => {
  const { db, login } = fixture(t, { now: () => new Date('2026-11-23T09:25:00Z') });
  db.exec(`
    INSERT INTO lessons VALUES
      (601, 'Р-21', 'Текущий семинар', 'Демо', '2026-11-23', '12:20', '13:45', '330'),
      (602, 'Р-21', 'Вечерняя пара', 'Демо', '2026-11-23', '15:00', '16:30', '331'),
      (603, 'Р-21', 'Завтрашний семинар', 'Демо', '2026-11-24', '10:40', '12:10', '332');
  `);
  const [mira, mark] = await Promise.all(['mira', 'mark'].map(login));
  const full = await mira.page('/', 200, mira.mode('full'));
  assert.match(full, /design-header-tools[\s\S]*?href="\/notices"[\s\S]*?href="\/student-card"/);
  assert.match(full, /data-phase="complete"[\s\S]*?Английский язык[\s\S]*?Прошла/);
  assert.match(full, /data-phase="current"[\s\S]*?Текущий семинар[\s\S]*?Идёт сейчас/);
  assert.match(full, /data-phase="upcoming"[\s\S]*?Вечерняя пара[\s\S]*?Предстоит/);
  assert.match(full, /Завтра <time datetime="2026-11-24"[\s\S]*?Завтрашний семинар/);
  assert.match(full, /Послезавтра <time datetime="2026-11-25"[\s\S]*?История региона/);
  assert.match(full, /design-home-news[\s\S]*?Скоро день рождения университета/);
  assert.doesNotMatch(await mark.page('/', 200, mark.mode('full')), /Английский язык|Завтрашний семинар/);
  const lite = await mira.page('/', 200, { 'Save-Data': 'on' });
  assert.doesNotMatch(lite, /design-header-tools|design-agenda|Завтрашний семинар|design-home-news/);
  assert.match(lite, /Открыть занятие/);
});

test('отдельные туры выбора используют тот же учебный план и проверяют группу и CSRF', async t => {
  const { login } = fixture(t);
  const [mira, mark] = await Promise.all(['mira', 'mark'].map(login));
  const full = mira.mode('full');
  assert.match(await mira.page('/plan#choice-11', 200, full), /id="choice-11"[\s\S]*?href="\/electives#choice-11"/);
  assert.match(await mira.page('/electives', 200, full), /Туры выбора[\s\S]*?action="\/electives\/11\/choice"/);
  const lite = await mira.page('/plan', 200, mira.mode('lite'));
  assert.match(lite, /action="\/plan\/11\/choice"/);
  assert.doesNotMatch(lite, /design-plan-choice-preview|href="\/electives/);
  assert.equal((await mark.post('/electives/11/choice', { option: '111' })).status, 404);
  assert.equal((await mira.post('/electives/11/choice', { option: '111', _csrf: 'wrong' })).status, 403);
  const chosen = await mira.post('/electives/11/choice', { option: '111' });
  assert.equal(chosen.status, 303);
  assert.equal(chosen.headers.get('location'), '/electives#choice-11');
  assert.match(await mira.page('/plan', 200, full), /Выбрано <strong>Дипломатия Восточной Азии/);
  assert.equal((await mira.post('/electives/11/withdraw', { option: '111' })).headers.get('location'), '/electives#choice-11');
});

test('форма в календаре добавляет личный дедлайн, возвращает к выбранному дню и сохраняет ошибку', async t => {
  const { login } = fixture(t);
  const [mira, mark] = await Promise.all(['mira', 'mark'].map(login));
  const full = mira.mode('full');
  const calendar = await mira.page('/calendar?date=2026-11-25', 200, full);
  assert.match(calendar, /Добавить дедлайн[\s\S]*?name="source" value="calendar"[\s\S]*?value="25\.11\.2026"/);
  assert.doesNotMatch(await mira.page('/calendar', 200, mira.mode('lite')), /name="source" value="calendar"/);
  assert.match(await mira.page('/services', 200, full), /design-service-full" href="\/calendar\?kind=deadline"/);
  const draft = { source: 'calendar', title: 'Сдать конспект', date: '25.11.2026' };
  const invalid = await mira.post('/deadlines', { ...draft, date: '31.02.2026' });
  assert.equal(invalid.status, 422);
  assert.match(await invalid.text(), /К дедлайнам в календаре[\s\S]*Сдать конспект[\s\S]*Введите существующую дату/);
  const saved = await mira.post('/deadlines', draft);
  assert.equal(saved.status, 303);
  const location = saved.headers.get('location');
  assert.match(location, /^\/calendar\?date=2026-11-25&kind=deadline&added=\d+#day-2026-11-25$/);
  assert.match(await mira.page(location, 200, full), /Дедлайн добавлен в календарь[\s\S]*Сдать конспект/);
  assert.doesNotMatch(await mark.page(location, 200, mark.mode('full')), /Дедлайн добавлен в календарь|Сдать конспект/);
});

test('полные страницы подписывают реквизиты и скрывают переходы отключённых модулей', async t => {
  const { login } = fixture(t, { selection: 'full,-electives,-university-news,-student-card,-deadlines,-notices' });
  const mira = await login('mira');
  const full = mira.mode('full');
  const home = await mira.page('/', 200, full);
  assert.doesNotMatch(home, /design-header-tools|design-home-news|href="\/electives"/);
  assert.equal((await mira.get('/electives')).status, 404);
  assert.doesNotMatch(await mira.page('/calendar', 200, full), /design-calendar-deadlines/);
  const card = await mira.page(disciplinePath('Регионоведение'), 200, full);
  assert.match(card, /design-discipline-facts[\s\S]*Аттестация[\s\S]*Зачётные единицы[\s\S]*Преподаватель[\s\S]*Ирина Голубева/);
  assert.match(card, /design-discipline-fallback" href="\/grades\/session"/);
  const requests = await mira.page('/requests', 200, full);
  assert.match(requests, /учебный офис[\s\S]*href="#request-certificate">Заказать справку об обучении/);
  assert.doesNotMatch(await mira.page('/requests', 200, mira.mode('lite')), /design-request-types/);
});
