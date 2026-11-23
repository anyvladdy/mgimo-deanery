import assert from 'node:assert/strict';
import { test } from 'node:test';
import { modulesFor } from '../src/modules/config.js';
import { disciplinePath, fixture } from './support/app-fixture.js';

const search = q => `/search?${new URLSearchParams({ q })}`;

test('поиск находит дисциплины, назначенных преподавателей, аудитории и личные записи', async t => {
  const { db, login } = fixture(t);
  const [mira, mark] = await Promise.all([login('mira'), login('mark')]);
  const id = db.prepare("INSERT INTO document_requests (student_id, kind, status) VALUES (2, 'Справка об обучении', 'Принята') RETURNING id").get().id;
  db.prepare("INSERT INTO deadlines (student_id, title, due_date, created_at) VALUES (2, 'Разбор графиков Марка', '2026-12-05', deanery_timestamp())").run();
  const thread = modulesFor(db).get('messages').createThread(db, 2, {
    channel: 'office', teacherId: null, subject: 'Вопрос об оплате Марка', body: 'Приватный текст', key: 'fixture-message',
  });
  assert.ok((await mark.page(search('оплате Марка'))).includes(`/messages/${thread}`));
  assert.match(await mira.page(search('оплате Марка')), /Ничего не найдено/);
  assert.match(await mark.page(search('Приватный текст')), /Ничего не найдено/);
  assert.ok((await mira.page(search('РЕГИОНОВЕ'))).includes(disciplinePath('Регионоведение')));
  assert.match(await mira.page(search('голубева')), /Преподаватели<\/h2>[\s\S]*Ирина Голубева/);
  assert.match(await mira.page(search('307')), /Аудитория 307/);
  assert.ok((await mark.page(search(`${id} · справка`))).includes(`/requests/${id}`));
  assert.doesNotMatch(await mira.page(search('справка')), new RegExp(`href="/requests/${id}"`));
  assert.match(await mark.page(search('графиков Марка')), /Разбор графиков Марка/);
  assert.match(await mira.page(search('графиков Марка')), /Ничего не найдено/);
  const noResults = await mira.page(search('<script>'));
  assert.ok(noResults.includes('value="&lt;script&gt;"'));
  assert.doesNotMatch(await mira.page(search('Р')), /Найдено \d+/);
  assert.match(await mira.page(search('а'.repeat(101)), 422), /до 100 символов/);
  const compact = await mira.page('/search', 200, { 'Save-Data': 'on' });
  assert.match(compact, /role="search"/);
  assert.doesNotMatch(compact, /<script|\/assets\/carbon.css/);
});

test('поиск сохраняет доступные группы в минимальном составе', async t => {
  const { login } = fixture(t, { selection: 'core,+search,-schedule' });
  const mira = await login('mira');
  assert.match(await mira.page(search('справка')), /Заказать справку/);
  assert.doesNotMatch(await mira.page('/search'), /Написать в учебный офис|Скачать календарь/);
});
