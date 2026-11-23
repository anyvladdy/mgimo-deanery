INSERT INTO university_news (id, title, body, campus_event_id, published_at)
VALUES (1, 'Скоро день рождения университета',
  'Приглашаем студентов и выпускников на день рождения университета. 27 ноября в актовом зале пройдут концерт и выставка студенческих проектов.',
  1, '2026-11-22 06:00:00')
ON CONFLICT(id) DO NOTHING;
