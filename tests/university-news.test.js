import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './support/app-fixture.js';

test('новости видны всему университету, а публикация доступна учебному офису', async t => {
  const { login } = fixture(t);
  const [mira, mark, office, teacher] = await Promise.all(['mira', 'mark', 'office', 'teacher'].map(login));
  for (const student of [mira, mark]) {
    assert.match(await student.page('/news'), /Скоро день рождения университета/);
    assert.match(await student.page('/news/1'), /27 ноября[\s\S]*href="\/events\/1"/);
  }
  const article = { title: 'Изменение режима', body: 'Текст <условий>' };
  assert.equal((await teacher.post('/office/news', article)).status, 403);
  assert.equal((await office.post('/office/news', { ...article, _csrf: 'wrong' })).status, 403);
  assert.equal((await office.post('/office/news', article)).status, 303);
  const list = await mira.page('/news');
  assert.match(list, /Изменение режима[\s\S]*Текст &lt;условий&gt;/);
  assert.match(await mark.page('/news/2'), /Изменение режима/);
});

test('сервисы показывают планы на СОП и обратную связь, а новость работает без событий кампуса', async t => {
  const { login } = fixture(t, { selection: 'core,+university-news,+in-development' });
  const mira = await login('mira');
  assert.match(await mira.page('/services'), /href="\/services\/in-development">В разработке/);
  const plans = await mira.page('/services/in-development');
  assert.match(plans, /СОП[\s\S]*Обязательный анонимный опрос/);
  assert.match(plans, /Благодарности и предложения[\s\S]*только выбранный адресат[\s\S]*имени или анонимно/);
  assert.equal((await mira.post('/services/in-development')).status, 404);
  assert.doesNotMatch(await mira.page('/news/1'), /href="\/events\/1"/);
});
