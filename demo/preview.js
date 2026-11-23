import { readFileSync } from 'node:fs';
import { openDatabase } from '../src/db/open.js';
import { weekForStudent, changesForStudent, markChangeRead } from '../src/schedule/schedule.js';

const db = openDatabase();
db.exec(readFileSync(new URL('./seed.sql', import.meta.url), 'utf8'));
const monday = '2026-11-23';
const changes = () => changesForStudent(db, 1, monday);
const [lesson] = changes();
console.log(`Мира · ${lesson.lesson_date}, ${lesson.starts_at} · ${lesson.subject}`);
console.log(`Аудитория ${lesson.current_room}, раньше ${lesson.scheduled_room}.\n`);
markChangeRead(db, 1, lesson.change_id);
console.log('Новых переносов у Миры после прочтения:', changes().filter(item => !item.is_read).length);
console.log('Аудитория в расписании Миры:', weekForStudent(db, 1, monday)[0].current_room);
console.log('Переносов в группе Марка:', changesForStudent(db, 2, monday).length);
db.close();
