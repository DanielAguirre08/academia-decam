// Capa de Datos — ejecuta `trabajo(conexion)` dentro de una transacción: si termina, se confirma;
// si lanza cualquier error, se deshace TODO lo que hizo y el error sigue hacia la ruta.
const pool = require('../config/db');

async function enTransaccion(trabajo) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();
    const resultado = await trabajo(conexion);
    await conexion.commit();
    return resultado;
  } catch (err) {
    await conexion.rollback();
    throw err;
  } finally {
    conexion.release();
  }
}

module.exports = { enTransaccion };
