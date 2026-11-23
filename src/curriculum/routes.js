import { Hono } from 'hono';
import { modulesFor } from '../modules/config.js';
import { messagePage } from '../ui/layout.js';
import { curriculumIndex, versionsForGroup, createDraft, curriculumDetails, editCurriculumCourse, publishCurriculum } from './curriculum.js';
import { curriculumPage, groupCurriculumPage, versionPage } from './pages.js';

const ctx = c => ({ staff: c.get('staff'), csrf: c.get('csrfToken') });
const validId = raw => /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : 0;

export function curriculumRoutes(db) {
  const routes = new Hono();
  const modules = modulesFor(db);
  const missing = c => c.html(messagePage('Учебный план не найден', 'Выберите группу или версию в списке.',
    '/office/curriculum', 'Учебные планы', ctx(c)), 404);
  const render = (c, id, error = '', status = 200) => {
    const version = curriculumDetails(db, id);
    return version ? c.html(versionPage(version, ctx(c), error), status) : missing(c);
  };
  routes.get('/', c => c.html(curriculumPage(curriculumIndex(db), ctx(c))));
  routes.get('/groups/:code', c => {
    const group = modules.get('registry').academicGroup(db, c.req.param('code'));
    return group ? c.html(groupCurriculumPage(group, versionsForGroup(db, group.code), ctx(c))) : missing(c);
  });
  routes.post('/groups/:code/draft', c => {
    const id = createDraft(db, c.req.param('code'), c.get('staff').id);
    return id ? c.redirect(`/office/curriculum/${id}`, 303) : missing(c);
  });
  routes.get('/:id', c => render(c, validId(c.req.param('id'))));
  routes.post('/:id/courses', c => {
    const id = validId(c.req.param('id'));
    const form = c.get('form');
    const subject = typeof form.subject === 'string' ? form.subject.trim() : '';
    const assessment = typeof form.assessment === 'string' ? form.assessment.trim() : '';
    const credits = validId(form.credits);
    const remove = form.action === 'remove';
    if (!subject || subject.length > 150 || !assessment || assessment.length > 100
      || (!remove && (form.action !== 'save' || !credits))) {
      return render(c, id, 'Укажите дисциплину, форму контроля и число зачётных единиц.', 422);
    }
    const result = editCurriculumCourse(db, id, { subject, assessment, credits }, remove);
    if (result === 'ok') return c.redirect(`/office/curriculum/${id}#courses`, 303);
    return result === 'missing' ? missing(c) : render(c, id, 'Опубликованная версия доступна для просмотра. Для правок откройте черновик.', 409);
  });
  routes.post('/:id/publish', c => {
    const id = validId(c.req.param('id'));
    const raw = c.get('form').revision;
    const revision = raw === '0' ? 0 : validId(raw) || -1;
    const result = publishCurriculum(db, id, revision, c.get('staff').id);
    if (result === 'ok') return c.redirect(`/office/curriculum/${id}`, 303);
    if (result === 'missing') return missing(c);
    const message = result === 'empty' ? 'Добавьте хотя бы одну дисциплину перед публикацией.'
      : result === 'gradebook' ? (modules.has('gradebook')
        ? 'По удаляемой дисциплине открыта ведомость. Завершите её перед публикацией.'
        : 'По удаляемой дисциплине открыта ведомость. Подключите ведомости, чтобы завершить её.')
        : result === 'debt' ? 'По удаляемой дисциплине есть задолженность. Сначала закройте её пересдачей.'
          : 'Версия изменилась. Проверьте актуальный список изменений перед публикацией.';
    return render(c, id, message, 409);
  });
  return routes;
}
