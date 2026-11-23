import { openDatabase } from '../src/db/open.js';
import { resolveModules } from '../src/modules/catalog.js';
import { demoDate } from '../src/modules/clock.js';
import { seedDemoData } from './seed.js';

const modules = resolveModules(process.env.DEANERY_MODULES ?? 'full');
const db = openDatabase(':memory:', { modules });

try {
  seedDemoData(db);
  const schedule = modules.get('schedule');
  if (schedule) {
    const changes = () => schedule.changesForStudent(db, 1, demoDate);
    const [lesson] = changes();
    console.log(`Мира · ${lesson.lesson_date}, ${lesson.starts_at} · ${lesson.subject}`);
    console.log(`Аудитория ${lesson.current_room}, раньше ${lesson.scheduled_room}.\n`);
    schedule.markChangeRead(db, 1, lesson.change_id);
    console.log('Новых переносов у Миры после прочтения:', changes().filter(item => !item.is_read).length);
    console.log('Аудитория в расписании Миры:', schedule.weekForStudent(db, 1, demoDate)[0].current_room);
    console.log('Переносов в группе Марка:', schedule.changesForStudent(db, 2, demoDate).length);
  } else {
    console.log('Расписание отключено. Вход и профиль доступны.');
    console.log('Подключённые разделы:', modules.ids.join(', '));
  }
} finally {
  db.close();
}
