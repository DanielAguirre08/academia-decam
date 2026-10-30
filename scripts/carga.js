/**
 * Prueba de carga de la API con fetch (sin herramientas externas). 4 escenarios:
 *   1. Cambio de nota (PATCH /api/calificaciones/:id) — 1 usuario, 20 veces seguidas
 *   2. Cambio de nota — 8 docentes a la vez sobre la MISMA calificación
 *   3. Consulta de notas (GET /api/calificaciones) — 40 usuarios a la vez
 *   4. Inicio de sesión (POST /api/auth/login) — 40 usuarios a la vez
 * y, aparte de la medición de rendimiento, la reproducción de un defecto:
 *   DEF-01. 40 cambios de nota a la vez: cuántos se cuelgan y si el servidor sigue respondiendo
 *
 *   npm run test:carga                   # los 4 escenarios + DEF-01
 *   npm run test:carga -- --sin-def01    # solo los 4 escenarios
 *
 * Levanta node server.js contra academia_decam_test (recreada antes de empezar). Cada petición
 * se corta a los 8 s y cuenta como fallida: así una petición colgada no deja colgada la prueba.
 * Por escenario reporta mediana, p95 y máximo del tiempo de respuesta y cuántas fueron correctas.
 * Termina con código 1 si alguna petición no fue correcta (o si el servidor dejó de responder).
 */
const { levantarServidor } = require('./servidor-pruebas');

const TIMEOUT_MS = 8000;
const ID_CALIFICACION = 1; // 6-A, Bimestre I: el docente 1 dicta ahí
// Cuentas de database/seed.sql: los 4 docentes dictan en 6-A.
const DOCENTES = ['prof', 'rosa.quispe', 'jorge.mendoza', 'carmen.vilca']
  .map((u) => ({ correo: u + '@acadecam.edu.pe', contrasena: 'decam2024', rol: 'docente' }));

let URL_BASE;

/** Una petición medida. Nunca lanza: devuelve { ms, status, ok, error }. */
async function medir(ruta, opciones, esCorrecta) {
  const inicio = performance.now();
  try {
    const res = await fetch(URL_BASE + ruta, Object.assign({ signal: AbortSignal.timeout(TIMEOUT_MS) }, opciones));
    const cuerpo = await res.json().catch(() => null);
    const ms = performance.now() - inicio;
    return { ms, status: res.status, ok: res.ok && esCorrecta(cuerpo), cuerpo, cookie: cookieDe(res) };
  } catch (e) {
    const ms = performance.now() - inicio;
    const error = e.name === 'TimeoutError' ? 'timeout ' + TIMEOUT_MS / 1000 + ' s' : e.message;
    return { ms, status: null, ok: false, error };
  }
}

function cookieDe(res) {
  const sid = (res.headers.getSetCookie() || []).find((c) => c.startsWith('decam.sid='));
  return sid ? sid.split(';')[0] : null;
}

const json = (metodo, cuerpo, cookie) => ({
  method: metodo,
  headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
  body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
});

const login = (cuenta) => medir('/api/auth/login', json('POST', cuenta), (c) => !!(c && c.id_usuario));
const cambiarNota = (cookie, valor) => medir('/api/calificaciones/' + ID_CALIFICACION,
  json('PATCH', { campo: 'examen1', valor }, cookie), (c) => !!c && c.id_calificacion === ID_CALIFICACION);
const consultarNotas = (cookie) => medir('/api/calificaciones', { headers: { Cookie: cookie } }, Array.isArray);

/** Abre n sesiones de docente (en serie, fuera de la medición) y devuelve sus cookies. */
async function sesiones(n) {
  const cookies = [];
  for (let i = 0; i < n; i++) {
    const r = await login(DOCENTES[i % DOCENTES.length]);
    if (!r.cookie) throw new Error('No se pudo iniciar sesión para preparar el escenario: ' + (r.error || r.status));
    cookies.push(r.cookie);
  }
  return cookies;
}

const ESCENARIOS = [
  {
    nombre: 'Cambio de nota — 1 usuario × 20 (en serie)',
    async correr() {
      const [cookie] = await sesiones(1);
      const r = [];
      for (let i = 0; i < 20; i++) r.push(await cambiarNota(cookie, 10 + (i % 10)));
      return r;
    }
  },
  {
    nombre: 'Cambio de nota — 8 simultáneos (misma nota)',
    async correr() {
      const cookies = await sesiones(8);
      return Promise.all(cookies.map((c, i) => cambiarNota(c, 11 + i)));
    }
  },
  {
    nombre: 'Consulta de notas — 40 simultáneos',
    async correr() {
      const cookies = await sesiones(40);
      return Promise.all(cookies.map((c) => consultarNotas(c)));
    }
  },
  {
    nombre: 'Inicio de sesión — 40 simultáneos',
    async correr() {
      return Promise.all(Array.from({ length: 40 }, (_, i) => login(DOCENTES[i % DOCENTES.length])));
    }
  }
];

// DEF-01: cada cambio de nota retiene una conexión del pool (10) mientras bloquea la fila, y el
// permiso del docente se consulta con OTRA conexión del pool. Con más de 10 a la vez, el que tiene
// el bloqueo espera una conexión que nunca se libera y el resto espera su bloqueo.
const DEF01 = {
  nombre: 'DEF-01: 40 cambios de nota simultáneos',
  async correr() {
    const cookies = await sesiones(40);
    const cambios = await Promise.all(cookies.map((c, i) => cambiarNota(c, 10 + (i % 10))));
    // Justo después: ¿responde una ruta que usa la base? ¿y una que no la usa?
    const conBase = await consultarNotas(cookies[0]);
    const sinBase = await medir('/api/auth/me', { headers: { Cookie: cookies[0] } }, (c) => !!(c && c.id_usuario));
    return { cambios, conBase, sinBase };
  }
};

function percentil(ordenados, p) {
  return ordenados[Math.max(0, Math.ceil((p / 100) * ordenados.length) - 1)];
}
function mediana(ordenados) {
  const m = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[m] : (ordenados[m - 1] + ordenados[m]) / 2;
}

function resumir(nombre, resultados) {
  const t = resultados.map((r) => r.ms).sort((a, b) => a - b);
  const fallos = {};
  for (const r of resultados.filter((x) => !x.ok)) {
    const motivo = r.error || 'HTTP ' + r.status + (r.cuerpo && r.cuerpo.error ? ' «' + r.cuerpo.error + '»' : '');
    fallos[motivo] = (fallos[motivo] || 0) + 1;
  }
  return {
    nombre,
    total: resultados.length,
    correctas: resultados.filter((r) => r.ok).length,
    mediana: mediana(t),
    p95: percentil(t, 95),
    maximo: t[t.length - 1],
    fallos
  };
}

function tabla(filas) {
  const cab = ['Escenario', 'Correctas', 'Mediana', 'p95', 'Máximo'];
  const ms = (v) => v.toFixed(0) + ' ms';
  const datos = filas.map((f) => [f.nombre, f.correctas + '/' + f.total, ms(f.mediana), ms(f.p95), ms(f.maximo)]);
  const anchos = cab.map((c, i) => Math.max(c.length, ...datos.map((d) => d[i].length)));
  const linea = (celdas) => '| ' + celdas.map((c, i) => (i ? c.padStart(anchos[i]) : c.padEnd(anchos[i]))).join(' | ') + ' |';
  return [linea(cab), '|' + anchos.map((a, i) => (i ? '-'.repeat(a + 1) + ':' : '-'.repeat(a + 2))).join('|') + '|', ...datos.map(linea)].join('\n');
}

function imprimirLinea(r, segundos) {
  console.log('• ' + r.nombre + ': ' + r.correctas + '/' + r.total + ' correctas en ' + segundos.toFixed(1) + ' s');
  for (const [motivo, n] of Object.entries(r.fallos)) console.log('    ✗ ' + n + ' × ' + motivo);
}

function respondio(nombre, r) {
  const estado = r.ok ? 'responde (HTTP ' + r.status + ', ' + r.ms.toFixed(0) + ' ms)' : 'NO responde (' + (r.error || 'HTTP ' + r.status) + ')';
  console.log('    ' + nombre + ': ' + estado);
  return r.ok;
}

async function main() {
  const conDef01 = !process.argv.includes('--sin-def01');
  const servidor = await levantarServidor();
  URL_BASE = servidor.url;
  const resumenes = [];
  let def01 = null;
  try {
    console.log('Prueba de carga contra ' + URL_BASE + ' — timeout por petición: ' + TIMEOUT_MS / 1000 + ' s\n');
    for (const e of ESCENARIOS) {
      const inicio = performance.now();
      const r = resumir(e.nombre, await e.correr());
      resumenes.push(r);
      imprimirLinea(r, (performance.now() - inicio) / 1000);
    }
    console.log('\n' + tabla(resumenes));

    if (conDef01) {
      console.log('\n--- Reproducción de defecto (no forma parte de la medición de rendimiento) ---\n');
      const inicio = performance.now();
      const { cambios, conBase, sinBase } = await DEF01.correr();
      const r = resumir(DEF01.nombre, cambios);
      imprimirLinea(r, (performance.now() - inicio) / 1000);
      const colgadas = cambios.filter((c) => c.error && c.error.startsWith('timeout')).length;
      console.log('    Colgadas (sin respuesta en ' + TIMEOUT_MS / 1000 + ' s): ' + colgadas + ' de ' + r.total);
      console.log('    Inmediatamente después, con un timeout de ' + TIMEOUT_MS / 1000 + ' s:');
      const baseOk = respondio('GET /api/calificaciones (usa la base)', conBase);
      respondio('GET /api/auth/me (no usa la base)', sinBase);
      console.log('\n' + tabla([r]));
      def01 = { r, baseOk };
    } else {
      console.log('\n(DEF-01 omitido por --sin-def01)');
    }
  } finally {
    await servidor.cerrar();
  }
  const fallo = resumenes.some((r) => r.correctas < r.total) || (def01 && (def01.r.correctas < def01.r.total || !def01.baseOk));
  if (fallo) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
