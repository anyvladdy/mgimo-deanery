import { html } from 'hono/html';
import { presentationVariant } from '../ui/presentation.js';
import { formatDate } from '../ui/format.js';
import { layout } from '../ui/layout.js';

export function disciplineIndex(subject, courses, href, context) {
  return layout(subject, html`
    <main id="content" class="page narrow">
      <a class="back-link" href="/plan">Учебный план</a>
      <header class="identity"><h1>${subject}</h1><p>Выберите вид контроля.</p></header>
      <ul class="office-records" role="list">${courses.map(course => html`
        <li><a class="button-link secondary" href="${href(course)}">${course.assessment}</a>
          <span>${course.credits} з. е.${course.postponed ? ' · Перенесена на следующий год' : ''}</span></li>`)}</ul>
    </main>`, context);
}

const score = new Intl.NumberFormat('ru', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rounding = { none: 'без округления', half_up: 'до ближайшего целого', down: 'вниз до целого' };

function gradeCalculator(formula, calculation, course, href) {
  if (!formula) return html`<p class="hint">Формула не опубликована.</p>`;
  const fields = [['current', 'Текущий балл'], ['exam', 'Предполагаемый балл за экзамен'], ['target', 'Желаемая итоговая оценка']];
  const firstError = Object.keys(calculation?.errors ?? {})[0];
  const { total, required } = calculation ?? {};
  return html`<section id="calculator" class="syllabus-section" aria-labelledby="calculator-title">
    <h2 id="calculator-title">${calculation ? 'Калькулятор оценки' : 'Формула оценки'}</h2>
    <p>Текущая работа ${formula.current_weight}%, экзамен ${formula.exam_weight}%.
      Шкала до ${formula.scale}. Итог ${rounding[formula.rounding]}.</p>
    ${calculation ? html`
      <p class="hint" id="calculator-hint">Расчёт по опубликованным весам. Текущая оценка введена вами и не является официальной.</p>
      <form class="form-panel" method="get" autocomplete="off" action="${href.split('?')[0]}#calculator">
        <input type="hidden" name="assessment" value="${course.assessment}">
        ${fields.map(([name, label]) => html`
          <label for="calculator-${name}">${label}${name === 'current' ? '' : ' (необязательно)'}</label>
          <input id="calculator-${name}" name="${name}" type="text" inputmode="decimal" maxlength="12"
            value="${calculation.values[name]}" aria-describedby="${calculation.errors[name] ? `calculator-${name}-error` : 'calculator-hint'}"
            ${name === 'current' ? 'required' : ''} ${calculation.errors[name] ? html`aria-invalid="true" ${name === firstError ? 'autofocus' : ''}` : ''}>
          ${calculation.errors[name] ? html`<p id="calculator-${name}-error" class="error" role="alert">${calculation.errors[name]}</p>` : ''}`)}
        <button class="primary">Рассчитать</button>
      </form>
      ${total != null || required != null ? html`<dl class="plan-courses" aria-label="Результат расчёта">
        ${total != null ? html`<div><dt>Прогноз итоговой оценки</dt><dd><strong>${formula.rounding === 'none' ? score.format(total) : total}</strong></dd></div>` : ''}
        ${required != null ? html`<div><dt>Нужный балл за экзамен</dt><dd><strong>${required === Infinity
          ? 'Недостижимо при этих весах' : required === 0 ? 'Достаточно 0' : score.format(required)}</strong></dd></div>` : ''}
      </dl>` : ''}` : ''}
  </section>`;
}

export function disciplinePage(course, details, calculation, block, href, context) {
  const { syllabus, formula, lesson, grade, history, exam, examDate, previousExam, teachers, contactHref } = details;
  const status = course.postponed ? 'Перенесена на следующий год' : course.state === 'debts' ? 'Долг'
    : course.passed ? 'Зачтено' : course.result ? 'Выставлено' : examDate ? 'Ожидается' : 'Не выставлено';
  const rich = presentationVariant() !== 'lite';
  const badge = html`<span class="status-pill${course.state === 'debts' ? ' is-warning' : course.passed ? ' is-ready' : ''}">${status}</span>`;
  const teacherNames = new Intl.ListFormat('ru').format(teachers);
  const hasAttempts = history?.attempts.some(attempt => attempt.result);
  return layout(course.subject, html`
    <main id="content" class="page narrow discipline">
      <a class="back-link" href="/plan">Учебный план</a>
      <header class="identity">
        <h1>${course.subject}</h1>
        <div${rich ? html` class="design-discipline-fallback"` : ''}>
          <p>${course.assessment} · ${course.credits} з. е. · ${context.student.group_code}${block?.period ? ` · ${block.period}` : ''}</p>
          ${teachers.length ? html`<p>${teacherNames}</p>` : ''}
          ${badge}
        </div>
        ${rich ? html`<dl class="design-discipline-facts" hidden>
          <div><dt>Аттестация</dt><dd>${course.assessment}</dd></div>
          <div><dt>Зачётные единицы</dt><dd>${course.credits}</dd></div>
          <div><dt>Группа</dt><dd>${context.student.group_code}</dd></div>
          ${teachers.length ? html`<div><dt>Преподаватель</dt><dd>${teacherNames}</dd></div>` : ''}
          <div><dt>Статус</dt><dd>${badge}</dd></div>
          ${block?.period ? html`<div><dt>Период</dt><dd>${block.period}</dd></div>` : ''}
        </dl>` : ''}
      </header>
      ${contactHref || block ? html`<div class="office-buttons">
        ${contactHref ? html`<a class="button-link primary" href="${contactHref}">Написать преподавателю</a>` : ''}
        ${block ? html`<a class="button-link secondary" href="/plan#choice-${block.id}">${block.open ? 'Отменить запись на курс' : 'Открыть блок выбора'}</a>` : ''}
      </div>` : ''}
      ${details.scheduleAvailable && !course.postponed ? html`<section class="syllabus-section"><h2>Ближайшее занятие</h2>
        ${lesson ? html`<p><time datetime="${lesson.lesson_date}">${formatDate(lesson.lesson_date)}</time> · ${lesson.starts_at}–${lesson.ends_at} МСК · ауд. ${lesson.current_room}</p>
          ${lesson.change_id ? html`<p class="hint">Было: ауд. ${lesson.scheduled_room}</p>` : ''}
          <a class="button-link secondary" href="/schedule?date=${lesson.lesson_date}#lesson-${lesson.lesson_id}">Открыть занятие</a>`
          : html`<p>Занятий по дисциплине больше нет.</p><a class="button-link secondary" href="/schedule">Открыть расписание</a>`}
      </section>` : ''}
      <section class="syllabus-section"><h2>Оценка и аттестация</h2>
        <p>${grade?.result ? html`Результат: <strong>${grade.result}</strong>` : 'Результат ещё не выставлен.'}</p>
        ${examDate && !course.postponed ? html`<p>${course.assessment} · ${exam || formatDate(examDate)}</p>` : ''}
        ${previousExam && !course.postponed ? html`<p class="hint">Было: ${previousExam}</p>` : ''}
        ${hasAttempts ? html`<ol class="office-records grade-history" role="list">
          ${history.attempts.filter(attempt => attempt.result).map(attempt => html`<li>
            <strong>${attempt.result}</strong>
            <span>${attempt.kind === 'retake' ? 'Пересдача' : attempt.sheet_id ? 'Ведомость' : 'Ранее внесённая запись'}
              ${attempt.published_at || attempt.exam_date ? formatDate(attempt.published_at || attempt.exam_date) : ''}</span>
          </li>`)}
        </ol>` : ''}
        <div class="office-buttons">
          <a class="button-link secondary" href="/grades${grade ? `#grade-${grade.id}` : ''}">Открыть ведомость</a>
          ${grade ? html`<a class="button-link secondary${rich && !hasAttempts ? ' design-discipline-fallback' : ''}" href="/grades/${grade.id}/history">История попыток</a>` : ''}
          ${!course.postponed ? html`<a class="button-link secondary${rich ? ' design-discipline-fallback' : ''}" href="/grades/session">Открыть сессию</a>` : ''}
        </div>
      </section>
      ${details.rulesAvailable ? html`<section class="syllabus-section"><h2>Правила дисциплины</h2>
        ${syllabus ? html`
          <p>${syllabus.summary}</p>
          <h3>Требования</h3><p>${syllabus.requirements}</p>
          <h3>Оценивание</h3><p>${syllabus.assessment}</p>
          <h3>Литература</h3><p>${syllabus.literature}</p>
          <div class="office-buttons">
            <a class="button-link secondary" href="/syllabuses/${syllabus.id}">Полный силлабус</a>
            <a class="button-link secondary" href="/syllabuses/${syllabus.id}?print=1">Печатный силлабус</a>
          </div>` : html`<p>Правила не опубликованы.</p>`}
      </section>${course.assessment === 'Экзамен' ? gradeCalculator(formula, calculation, course, href) : ''}` : ''}
      ${course.requestId ? html`<section class="syllabus-section"><h2>Перенос дисциплины</h2>
        <a class="button-link secondary" href="/requests/${course.requestId}">Открыть заявку о переносе</a>
      </section>` : ''}
    </main>`, context);
}
