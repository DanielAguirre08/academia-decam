/**
 * Pruebas de sistema (E2E) con Selenium WebDriver sobre Chrome headless:
 *   TC-SEL-01  HU-001 + HU-008  el docente inicia sesión y toma asistencia de su grupo (10 pasos)
 *   TC-SEL-02  HU-001 CA-002    credenciales de docente en la pestaña Alumno: se rechaza (3 pasos)
 *
 *   npm run test:e2e
 *
 * Levanta node server.js contra academia_decam_test (recreada antes de empezar) y maneja la
 * interfaz real (dashboard.html) como lo haría el docente. Cada paso es una subprueba: si uno
 * falla, los siguientes se marcan como omitidos en vez de fallar en cascada.
 */
process.env.DB_NAME = process.env.DB_NAME_TEST || 'academia_decam_test'; // antes de config/db.js

const { describe, before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { levantarServidor } = require('../../scripts/servidor-pruebas');
const pool = require('../../config/db');

const ESPERA = 10000; // ms máximos para que aparezca algo en pantalla
const DOCENTE = { correo: 'prof@acadecam.edu.pe', contrasena: 'decam2024' }; // id_docente 1, tutor de 6-A
const SECCION_6A = '1';
const ALUMNOS_6A = 5; // activos en database/seed.sql

let servidor, driver;

before(async () => {
  servidor = await levantarServidor();
  const opciones = new chrome.Options().addArguments('--headless=new', '--window-size=1366,900');
  driver = await new Builder().forBrowser('chrome').setChromeOptions(opciones).build();
});

after(async () => {
  if (driver) await driver.quit();
  if (servidor) await servidor.cerrar();
  await pool.end();
});

/** Registra un paso como subprueba; tras el primer fallo, el resto se omite. */
function pasos(t) {
  let fallo = false;
  return async (nombre, fn) => {
    await t.test(nombre, { skip: fallo && 'un paso anterior falló' }, async () => {
      try { await fn(); } catch (e) { fallo = true; throw e; }
    });
  };
}

const visible = (selector) => driver.wait(until.elementIsVisible(driver.findElement(By.css(selector))), ESPERA);
const clase = (el) => el.getAttribute('class');

async function abrirLogin() {
  await driver.manage().deleteAllCookies();
  await driver.get(servidor.url + '/dashboard.html');
  await driver.wait(until.elementLocated(By.css('#login-screen.active')), ESPERA);
}

async function escribir(selector, texto) {
  const el = await visible(selector);
  await el.clear();
  await el.sendKeys(texto);
}

describe('E2E — flujo principal (Selenium)', () => {
  test('TC-SEL-01 — el docente inicia sesión y toma asistencia de su grupo (HU-001 + HU-008)', async (t) => {
    const paso = pasos(t);

    await paso('Paso 1: abrir el portal muestra la pantalla de inicio de sesión', async () => {
      await abrirLogin();
      assert.equal(await (await driver.findElement(By.id('portal-screen'))).isDisplayed(), false);
    });

    await paso('Paso 2: elegir la pestaña «Docente»', async () => {
      await (await visible('#tab-teacher')).click();
      assert.match(await clase(await driver.findElement(By.id('tab-teacher'))), /\bactive\b/);
    });

    await paso('Paso 3: escribir el correo institucional', async () => {
      await escribir('#login-email', DOCENTE.correo);
      assert.equal(await driver.findElement(By.id('login-email')).getAttribute('value'), DOCENTE.correo);
    });

    await paso('Paso 4: escribir la contraseña', async () => {
      await escribir('#login-pass', DOCENTE.contrasena);
    });

    await paso('Paso 5: pulsar «Iniciar sesión» abre el portal (HU-001 CA-001)', async () => {
      await driver.findElement(By.css('.login-btn')).click();
      await driver.wait(until.elementLocated(By.css('#portal-screen.active')), ESPERA);
      await driver.wait(until.elementIsNotVisible(driver.findElement(By.id('loading-screen'))), ESPERA);
      await visible('#page-dashboard');
    });

    await paso('Paso 6: el menú es el del docente (acceso por rol)', async () => {
      assert.equal(await driver.findElement(By.css('.nav-item[data-page="asistencia"]')).isDisplayed(), true);
      assert.equal(await driver.findElement(By.id('nav-registro')).isDisplayed(), false, 'el docente no debe ver Registro');
      assert.equal(await driver.findElement(By.id('nav-matricula')).isDisplayed(), false, 'el docente no debe ver Matrícula');
    });

    await paso('Paso 7: entrar a Asistencia sin grupo muestra «Selecciona un grupo» (HU-008 CA-002)', async () => {
      await driver.findElement(By.css('.nav-item[data-page="asistencia"]')).click();
      await visible('#page-asistencia');
      await driver.wait(until.elementTextContains(driver.findElement(By.id('att-tbody')), 'Selecciona un grupo'), ESPERA);
      assert.equal((await driver.findElements(By.css('#att-tbody tr[data-id-alumno]'))).length, 0);
    });

    await paso('Paso 8: elegir el grupo 6-A carga la lista con las opciones de marcado (HU-008 CA-001)', async () => {
      // El combo se llena desde GET /api/secciones: se espera a que aparezca la opción.
      const opcion = await driver.wait(until.elementLocated(By.css('#att-group-filter option[value="' + SECCION_6A + '"]')), ESPERA);
      await opcion.click();
      await driver.wait(async () => (await driver.findElements(By.css('#att-tbody tr[data-id-alumno]'))).length === ALUMNOS_6A, ESPERA,
        'no se cargaron los ' + ALUMNOS_6A + ' alumnos activos de 6-A');
      const botones = await driver.findElements(By.css('#att-tbody tr[data-id-alumno] .att-r'));
      assert.equal(botones.length, ALUMNOS_6A * 3, 'cada alumno debe tener P, A y T');
    });

    await paso('Paso 9: «Todos presentes» y luego un ausente y una tardanza (HU-008 CA-003)', async () => {
      await driver.findElement(By.xpath('//button[contains(., "Todos presentes")]')).click();
      const filas = await driver.findElements(By.css('#att-tbody tr[data-id-alumno]'));
      for (const fila of filas) {
        assert.match(await clase(await fila.findElement(By.css('.att-r:nth-child(1)'))), /\bsel-p\b/);
      }
      await filas[0].findElement(By.css('.att-r:nth-child(2)')).click(); // A
      await filas[1].findElement(By.css('.att-r:nth-child(3)')).click(); // T
      assert.match(await clase(await filas[0].findElement(By.css('.att-r:nth-child(2)'))), /\bsel-a\b/);
      assert.match(await clase(await filas[1].findElement(By.css('.att-r:nth-child(3)'))), /\bsel-l\b/);
    });

    await paso('Paso 10: «Guardar» confirma y deja el pase de lista en MySQL (HU-008 CA-003)', async () => {
      const filas = await driver.findElements(By.css('#att-tbody tr[data-id-alumno]'));
      const ausente = Number(await filas[0].getAttribute('data-id-alumno'));
      const tarde = Number(await filas[1].getAttribute('data-id-alumno'));
      const fecha = await driver.findElement(By.id('att-date')).getAttribute('value');

      await driver.findElement(By.xpath('//button[contains(., "Guardar")][contains(@onclick, "guardarAsistencia")]')).click();
      const toast = await driver.wait(until.elementLocated(By.id('toast-msg')), ESPERA);
      await driver.wait(until.elementTextContains(toast, 'Asistencia guardada'), ESPERA);
      assert.match(await toast.getText(), new RegExp('\\(' + ALUMNOS_6A + ' alumnos\\)'));

      const [guardadas] = await pool.query(
        'SELECT id_alumno, estado, id_docente_registra FROM asistencia WHERE id_seccion = ? AND fecha = ?', [SECCION_6A, fecha]);
      assert.equal(guardadas.length, ALUMNOS_6A);
      const estado = Object.fromEntries(guardadas.map((g) => [g.id_alumno, g.estado]));
      assert.equal(estado[ausente], 'ausente');
      assert.equal(estado[tarde], 'tardanza');
      assert.equal(guardadas.filter((g) => g.estado === 'presente').length, ALUMNOS_6A - 2);
      assert.ok(guardadas.every((g) => g.id_docente_registra === 1), 'lo firma el docente de la sesión');
    });
  });

  test('TC-SEL-02 — credenciales de docente en la pestaña Alumno se rechazan (HU-001 CA-002)', async (t) => {
    const paso = pasos(t);

    await paso('Paso 1: abrir el portal y elegir la pestaña «Alumno»', async () => {
      await abrirLogin();
      await (await visible('#tab-student')).click();
      assert.match(await clase(await driver.findElement(By.id('tab-student'))), /\bactive\b/);
    });

    await paso('Paso 2: ingresar correo y contraseña VÁLIDOS de un docente y pulsar «Iniciar sesión»', async () => {
      await escribir('#login-email', DOCENTE.correo);
      await escribir('#login-pass', DOCENTE.contrasena);
      await driver.findElement(By.css('.login-btn')).click();
    });

    await paso('Paso 3: se muestra «Correo o contraseña incorrectos» y no se entra al portal', async () => {
      const error = await visible('#login-error');
      await driver.wait(until.elementTextIs(error, 'Correo o contraseña incorrectos'), ESPERA);
      assert.equal(await driver.findElement(By.id('portal-screen')).isDisplayed(), false);
      const me = await driver.executeAsyncScript('const listo = arguments[0]; fetch("/api/auth/me").then((r) => listo(r.status));');
      assert.equal(me, 401, 'no debe quedar una sesión abierta');
    });
  });
});
