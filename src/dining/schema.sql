CREATE TABLE IF NOT EXISTS dining_menus (
  menu_date TEXT PRIMARY KEY NOT NULL,
  point TEXT NOT NULL,
  opens_at TEXT NOT NULL,
  closes_at TEXT NOT NULL CHECK (closes_at > opens_at)
);

CREATE TABLE IF NOT EXISTS dining_dishes (
  menu_date TEXT NOT NULL REFERENCES dining_menus(menu_date),
  position INTEGER NOT NULL CHECK (position > 0),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price > 0),
  PRIMARY KEY (menu_date, position)
);
