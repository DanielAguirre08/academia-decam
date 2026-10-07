/**
 * Crea (o recrea) la base de PRUEBAS con el mismo esquema y los mismos datos que la de desarrollo:
 *   node scripts/preparar-bd-pruebas.js            -> academia_decam_test
 *
 * Los .sql de database/ tienen escrito "academia_decam"; aquí se reemplaza por el nombre de la
 * base de pruebas antes de pasárselos al cliente mysql, así hay UNA sola fuente de verdad del
 * esquema y las pruebas de API nunca tocan la base de desarrollo.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE = process.env.DB_NAME_TEST || 'academia_decam_test';

// Salvaguarda: este script hace DROP DATABASE. Nunca debe apuntar a la base de desarrollo.
if (!/_test$/.test(BASE)) {
  console.error('La base de pruebas debe terminar en "_test" (se recibió "' + BASE + '").');
  process.exit(1);
}

const archivos = ['reset.sql', 'schema.sql', 'seed.sql'];
const sql = archivos
  .map(function (nombre) { return fs.readFileSync(path.join(__dirname, '..', 'database', nombre), 'utf8'); })
  .join('\n')
  .replace(/\bacademia_decam\b/g, BASE);

const entorno = Object.assign({}, process.env);
if (process.env.DB_PASSWORD) entorno.MYSQL_PWD = process.env.DB_PASSWORD;

const resultado = spawnSync('mysql', [
  '--default-character-set=utf8mb4',
  '-h', process.env.DB_HOST || 'localhost',
  '-P', String(process.env.DB_PORT || 3306),
  '-u', process.env.DB_USER || 'root'
], { input: sql, env: entorno, encoding: 'utf8' });

if (resultado.error || resultado.status !== 0) {
  console.error((resultado.error && resultado.error.message) || resultado.stderr);
  process.exit(1);
}
console.log('Base de pruebas "' + BASE + '" lista.');
