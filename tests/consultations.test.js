import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './support/app-fixture.js';

test('назначенный преподаватель публикует консультацию, запись учитывает группу, места и отмену', async t => {
  const { db, login } = fixture(t);
  const [teacher, mira, mark, peer] = await Promise.all(['teacher', 'mira', 'mark', 'peer'].map(login));
  const form = {
    subject: 'Регионоведение', group: 'Р-21', date: '25.11.2026', start: '14:00', end: '14:30',
    mode: 'offline', room: '214', capacity: '1', note: 'Разбор темы',
  };
  const officePath = '/office/consultations';
  assert.equal((await teacher.post(officePath, { ...form, _csrf: 'wrong' })).status, 403);
  assert.equal((await teacher.post(officePath, { ...form, group: 'Э-11' })).status, 403);
  const published = await teacher.post(officePath, form);
  assert.equal(published.status, 303);
  const id = new URL(published.headers.get('location'), 'https://fixture.invalid').searchParams.get('saved');
  assert.equal((await teacher.post(officePath, form)).headers.get('location'), published.headers.get('location'));
  const book = `/consultations/${id}/book`;
  const cancel = `/consultations/${id}/cancel`;
  assert.match(await mira.page('/consultations'), /Регионоведение[\s\S]*14:00–14:30[\s\S]*214/);
  assert.doesNotMatch(await mark.page('/consultations'), /Регионоведение/);
  assert.equal((await mark.post(book, { topic: 'Чужая группа' })).status, 404);
  assert.equal((await mira.post(book, { topic: '' })).status, 422);
  assert.equal((await mira.post(book, { topic: 'Подготовка к экзамену' })).status, 303);
  assert.equal((await mira.post(book, { topic: 'Повторная отправка' })).status, 303);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM consultation_bookings').get().total, 1);
  const noSeats = await peer.post(book, { topic: 'Подготовка' });
  assert.equal(noSeats.status, 409);
  assert.match(await noSeats.text(), /Свободных мест нет/);
  assert.match(await mira.page('/calendar?kind=consultation'), /Регионоведение/);
  assert.doesNotMatch(await mark.page('/calendar?kind=consultation'), /Регионоведение/);
  assert.match(await mira.page(`/messages/new?consultation=${id}`), /Консультация: Регионоведение/);
  assert.equal((await mark.get(`/messages/new?consultation=${id}`)).status, 404);
  assert.equal((await mira.post(cancel)).status, 303);
  assert.equal((await mira.post(cancel)).status, 303);
  assert.equal((await peer.post(book, { topic: 'Подготовка' })).status, 303);
  assert.equal((await teacher.post(`${officePath}/${id}/cancel`)).status, 303);
  assert.doesNotMatch(await peer.page('/calendar?kind=consultation'), /Регионоведение/);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});
