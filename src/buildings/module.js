import { buildingRoutes } from './routes.js';

export default {
  id: 'buildings',
  demoUpgrade: 2,
  services: {
    roomsWithBuildings(db) {
      return db.prepare(`
        SELECT room, b.id AS building_id, b.name, b.address
        FROM campus_room_locations JOIN campus_buildings b ON b.id = building_id ORDER BY room
      `).all();
    },
    campusLocations(db) {
      const buildings = db.prepare('SELECT id, name FROM campus_buildings ORDER BY id').all();
      const byRoom = new Map(db.prepare('SELECT room, building_id FROM campus_room_locations').all()
        .map(({ room, building_id }) => [room, building_id]));
      return { buildings, byRoom };
    },
  },
  studentMount: ({ db, currentSchoolDay }) => ['/buildings', buildingRoutes(db, currentSchoolDay)],
  navigation: group => group === 'studentServices' ? [[30, '/buildings', 'Корпуса', 'buildings']] : [],
};
