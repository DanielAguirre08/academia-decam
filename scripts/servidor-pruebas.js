/**
 * Levanta el servidor REAL (node server.js) contra la base de PRUEBAS, para las pruebas que
 * entran por HTTP como lo haría un navegador: tests/e2e, tests/a11y y scripts/carga.js.
 *
 *   const { levantarServidor } = require('../../scripts/servidor-pruebas');
 *   const servidor = await levantarServidor();   // { url, cerrar }
 *
 * Antes de arrancar recrea academia_decam_test (scripts/preparar-bd-pruebas.js), así cada corrida
 * parte de los mismos datos de database/seed.sql y nunca toca la base de desarrollo.
 * Con BASE_URL=http://... no levanta nada ni recrea la base: usa ese servidor tal cual.
 */
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const PUERTO = Number(process.env.PUERTO_PRUEBAS || 3101);

function prepararBase() {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'preparar-bd-pruebas.js')], { cwd: RAIZ, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('No se pudo recrear la base de pruebas: ' + (r.stderr || r.stdout));
}

async function levantarServidor() {
  if (process.env.BASE_URL) return { url: process.env.BASE_URL.replace(/\/$/, ''), cerrar: async () => {} };

  prepararBase();
  const entorno = Object.assign({}, process.env, {
    DB_NAME: process.env.DB_NAME_TEST || 'academia_decam_test',
    PORT: String(PUERTO)
  });
  const hijo = spawn(process.execPath, ['server.js'], { cwd: RAIZ, env: entorno, stdio: ['ignore', 'pipe', 'pipe'] });
  // Los errores del servidor (p. ej. un 500) quedan en la salida de la prueba como evidencia.
  hijo.stderr.on('data', (d) => process.stderr.write(String(d).replace(/^(?=.)/gm, '[servidor] ')));

  await new Promise((resolver, rechazar) => {
    const limite = setTimeout(() => rechazar(new Error('El servidor no arrancó en 10 s')), 10000);
    hijo.stdout.on('data', (d) => {
      if (/escuchando/.test(String(d))) { clearTimeout(limite); resolver(); }
    });
    hijo.on('exit', (codigo) => { clearTimeout(limite); rechazar(new Error('El servidor terminó con código ' + codigo)); });
  });

  return {
    url: 'http://localhost:' + PUERTO,
    cerrar: () => new Promise((resolver) => {
      if (hijo.exitCode !== null) return resolver();
      hijo.removeAllListeners('exit');
      hijo.once('exit', () => resolver());
      hijo.kill();
    })
  };
}

module.exports = { levantarServidor };
