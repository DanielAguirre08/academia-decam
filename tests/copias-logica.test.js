/**
 * La capa de Lógica del Docente existe en dos lugares: logica-docente.js (la usa el servidor)
 * y js/logica-docente.js (la descarga el navegador). Si alguien edita solo una, el navegador y el
 * servidor aplicarían reglas distintas. Esta prueba falla en cuanto dejan de ser idénticas.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('logica-docente.js y js/logica-docente.js son idénticos', () => {
  const raiz = path.join(__dirname, '..');
  const servidor = fs.readFileSync(path.join(raiz, 'logica-docente.js'), 'utf8');
  const navegador = fs.readFileSync(path.join(raiz, 'js', 'logica-docente.js'), 'utf8');
  assert.equal(navegador, servidor, 'Copia logica-docente.js a js/logica-docente.js (o al revés)');
});
