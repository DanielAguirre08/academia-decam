/**
 * Pruebas de accesibilidad con axe-core (vía @axe-core/webdriverjs) sobre Chrome headless.
 * Analiza 3 pantallas con las reglas WCAG 2.0 / 2.1 nivel A y AA:
 *   1. Inicio de sesión          (sin sesión)
 *   2. Registro   (HU-002)       (como Registrador)
 *   3. Matrícula  (HU-003/004)   (como Registrador)
 *
 *   npm run test:a11y
 *   npm run test:a11y -- --salida docs/evidencias/axe-despues.json
 *
 * Imprime un resumen por pantalla y guarda el resultado completo en docs/evidencias/axe.json
 * (o en la ruta de --salida, para no pisar una evidencia anterior).
 * Termina con código 1 si alguna pantalla tiene violaciones.
 */
const fs = require('fs');
const path = require('path');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { AxeBuilder } = require('@axe-core/webdriverjs');
const { levantarServidor } = require('../../scripts/servidor-pruebas');

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const iSalida = process.argv.indexOf('--salida');
const SALIDA = iSalida > 0 && process.argv[iSalida + 1]
  ? path.resolve(process.argv[iSalida + 1])
  : path.join(__dirname, '..', '..', 'docs', 'evidencias', 'axe.json');
const ESPERA = 10000;
const REGISTRADOR = { correo: 'registrador@acadecam.edu.pe', contrasena: 'reg2024' };

async function iniciarSesionComoRegistrador(driver) {
  await driver.findElement(By.id('tab-registrador')).click();
  await driver.findElement(By.id('login-email')).sendKeys(REGISTRADOR.correo);
  await driver.findElement(By.id('login-pass')).sendKeys(REGISTRADOR.contrasena);
  await driver.findElement(By.css('.login-btn')).click();
  await driver.wait(until.elementLocated(By.css('#portal-screen.active')), ESPERA);
  await driver.wait(until.elementIsNotVisible(driver.findElement(By.id('loading-screen'))), ESPERA);
}

async function irA(driver, pagina) {
  await driver.findElement(By.css('.nav-item[data-page="' + pagina + '"]')).click();
  await driver.wait(until.elementIsVisible(driver.findElement(By.id('page-' + pagina))), ESPERA);
  await driver.sleep(500); // deja terminar las cargas de la API que pintan la página
}

async function analizar(driver, nombre) {
  const r = await new AxeBuilder(driver).withTags(TAGS).analyze();
  return {
    pantalla: nombre,
    url: r.url,
    axe: r.testEngine.version,
    violaciones: r.violations.map((v) => ({
      regla: v.id,
      impacto: v.impact,
      descripcion: v.help,
      wcag: v.tags.filter((t) => /^wcag\d/.test(t)),
      ayuda: v.helpUrl,
      nodos: v.nodes.map((n) => ({ selector: n.target.join(' '), html: n.html, resumen: n.failureSummary }))
    })),
    totales: {
      violaciones: r.violations.length,
      nodosAfectados: r.violations.reduce((s, v) => s + v.nodes.length, 0),
      revisionManual: r.incomplete.length,
      aprobadas: r.passes.length
    }
  };
}

function imprimir(res) {
  const t = res.totales;
  console.log('\n== ' + res.pantalla + ' ==');
  console.log('   ' + t.violaciones + ' reglas violadas (' + t.nodosAfectados + ' elementos) · ' +
    t.aprobadas + ' aprobadas · ' + t.revisionManual + ' para revisión manual');
  for (const v of res.violaciones) {
    console.log('   - [' + v.impacto + '] ' + v.regla + ' (' + v.wcag.join(', ') + '): ' + v.descripcion + ' — ' + v.nodos.length + ' elemento(s)');
    for (const n of v.nodos.slice(0, 5)) console.log('       ' + n.selector);
    if (v.nodos.length > 5) console.log('       … y ' + (v.nodos.length - 5) + ' más');
  }
}

async function main() {
  const servidor = await levantarServidor();
  const opciones = new chrome.Options().addArguments('--headless=new', '--window-size=1366,900');
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(opciones).build();
  const resultados = [];
  try {
    await driver.get(servidor.url + '/dashboard.html');
    await driver.wait(until.elementLocated(By.css('#login-screen.active')), ESPERA);
    resultados.push(await analizar(driver, 'Inicio de sesión'));

    await iniciarSesionComoRegistrador(driver);
    await irA(driver, 'registro');
    resultados.push(await analizar(driver, 'Registro (HU-002)'));

    await irA(driver, 'matricula');
    resultados.push(await analizar(driver, 'Matrícula (HU-003 / HU-004)'));
  } finally {
    await driver.quit();
    await servidor.cerrar();
  }

  console.log('Análisis de accesibilidad con axe-core ' + resultados[0].axe + ' — reglas: ' + TAGS.join(', '));
  resultados.forEach(imprimir);

  fs.writeFileSync(SALIDA, JSON.stringify({ fecha: new Date().toISOString(), tags: TAGS, pantallas: resultados }, null, 2) + '\n');
  const total = resultados.reduce((s, r) => s + r.totales.violaciones, 0);
  console.log('\nTotal: ' + total + ' violaciones en ' + resultados.length + ' pantallas. Detalle en ' + path.relative(process.cwd(), SALIDA));
  if (total > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
