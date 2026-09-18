// Capa de Datos — conexión real a MySQL 8.0 (reemplaza a los arrays en memoria
// que usaba datos-docente.js en el prototipo del navegador).
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'academia_decam',
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
