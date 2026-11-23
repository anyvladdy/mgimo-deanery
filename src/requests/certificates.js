import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { html } from 'hono/html';
import { hasTable } from '../db/sql.js';
import { writeTransaction } from '../db/write.js';
import { formatDate } from '../ui/format.js';
import { layout } from '../ui/layout.js';

function readyCertificate(db, id, studentId) {
  return db.prepare(`
    SELECT verification_code, issued_at FROM document_requests
    WHERE id = ? AND student_id = ? AND kind = 'Справка об обучении' AND status = 'Готова'
  `).get(id, studentId);
}

export function issueCertificate(db, id, studentId) {
  const request = readyCertificate(db, id, studentId);
  if (!request || request.verification_code) return request;
  const reviewedAt = hasTable(db, 'request_reviews')
    ? db.prepare('SELECT reviewed_at FROM request_reviews WHERE request_id = ?').get(id)?.reviewed_at : null;
  const update = db.prepare(`
    UPDATE OR IGNORE document_requests SET verification_code = ?,
      issued_at = COALESCE(issued_at, ?, deanery_timestamp())
    WHERE id = ? AND verification_code IS NULL
    RETURNING verification_code, issued_at
  `);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const issued = update.get(randomBytes(9).toString('base64url'), reviewedAt ?? null, id);
    if (issued) return issued;
  }
  throw new Error('Не удалось присвоить справке уникальный код');
}

export function certificateForStudent(db, id, studentId) {
  const request = readyCertificate(db, id, studentId);
  if (!request || request.verification_code) return request;
  return writeTransaction(db, () => issueCertificate(db, id, studentId));
}

export function certificatePrint(id, certificate, student, csrf) {
  return layout('Справка об обучении', html`
    <main id="content" class="page narrow printable">
      <a class="back-link print-help" href="/requests/${id}">К заявке</a>
      <header class="identity"><h1>Справка об обучении</h1></header>
      <p>Учебный офис подтверждает, что ${student.full_name} обучается по программе «${student.program}» в группе ${student.group_code}.</p>
      <dl class="plan-courses">
        <div><dt>Дата выдачи</dt><dd>${formatDate(certificate.issued_at)}</dd></div>
        <div><dt>Код проверки</dt><dd><strong>${certificate.verification_code}</strong></dd></div>
        <div><dt>Место получения оригинала</dt><dd>Учебный офис</dd></div>
      </dl>
      <p>Подпись сотрудника учебного офиса ____________________</p>
      <p class="print-help"><a class="button-link secondary" href="/verify/${certificate.verification_code}">Открыть проверку справки</a></p>
      <p class="print-help">Для PDF выберите «Печать» в меню браузера.</p>
    </main>`, { student, csrf, active: 'requests' });
}

export function verificationRoutes(db) {
  const routes = new Hono();
  routes.get('/:code', c => {
    c.header('Referrer-Policy', 'no-referrer');
    const code = c.req.param('code');
    const certificate = /^[A-Za-z0-9_-]{12}$/.test(code) ? db.prepare(`
      SELECT kind, issued_at FROM document_requests
      WHERE verification_code = ? AND kind = 'Справка об обучении' AND status = 'Готова'
    `).get(code) : null;
    return c.html(layout('Проверка справки', html`
      <main id="content" class="page narrow">
        <header class="identity"><h1>Проверка справки</h1></header>
        ${certificate ? html`<section class="today-panel">
          <h2>${certificate.kind}</h2>
          <p class="status-pill is-ready">Справка действительна</p>
          <p>Дата выдачи · ${formatDate(certificate.issued_at)}</p>
        </section>` : html`<p class="section-empty">Справка не найдена. Проверьте код по документу.</p>`}
      </main>`), certificate ? 200 : 404);
  });
  return routes;
}
