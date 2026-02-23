/**
 * seed.js — Crea usuarios de prueba en la base de datos.
 * Ejecutar una sola vez con:  node database/seed.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createUser } = require('./db');

const SALT_ROUNDS = 12;

const testUsers = [
  { username: 'admin',    password: 'Admin123!' },
  { username: 'carlos',   password: 'Carlos456!' },
  { username: 'prueba',   password: 'Test789!' },
];

async function seed() {
  console.log('🌱  Creando usuarios de prueba...\n');

  for (const user of testUsers) {
    const hash = await bcrypt.hash(user.password, SALT_ROUNDS);
    const result = createUser.run(user.username, hash);

    if (result.changes > 0) {
      console.log(`  ✔  Usuario creado:  ${user.username}  /  ${user.password}`);
    } else {
      console.log(`  –  Ya existe:       ${user.username}`);
    }
  }

  console.log('\n✅  Seed completado.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Error al ejecutar seed:', err);
  process.exit(1);
});
