/**
 * Cada capa de Lógica existe en dos lugares: en la raíz (la usa el servidor) y en js/ (la
 * descarga el navegador). Si alguien edita solo una, el navegador y el servidor aplicarían
 * reglas distintas. Esta prueba falla en cuanto dejan de ser idénticas.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');

for (const archivo of ['logica-docente.js', 'logica-registro.js', 'logica-alumno.js', 'logica-comunicacion.js']) {
  test(archivo + ' y js/' + archivo + ' son idénticos', () => {
    const servidor = fs.readFileSync(path.join(raiz, archivo), 'utf8');
    const navegador = fs.readFileSync(path.join(raiz, 'js', archivo), 'utf8');
    assert.equal(navegador, servidor, 'Copia ' + archivo + ' a js/' + archivo + ' (o al revés)');
  });
}
