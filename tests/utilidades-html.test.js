/**
 * Pruebas unitarias — escaparHtml (protección contra XSS en la capa de Presentación).
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { escaparHtml } = require('../js/utilidades-html.js');

describe('escaparHtml', () => {
  test('neutraliza etiquetas y manejadores de eventos', () => {
    assert.equal(escaparHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  test('escapa comillas simples (rompen atributos con comilla simple)', () => {
    assert.equal(escaparHtml("O'Brien"), 'O&#39;Brien');
  });

  test('escapa & primero, sin dobles escapes', () => {
    assert.equal(escaparHtml('a & b &lt;'), 'a &amp; b &amp;lt;');
  });

  test('deja intactos tildes, ñ y texto normal', () => {
    assert.equal(escaparHtml('María Núñez — 6-A'), 'María Núñez — 6-A');
  });

  test('null/undefined -> cadena vacía; números -> texto', () => {
    assert.equal(escaparHtml(null), '');
    assert.equal(escaparHtml(undefined), '');
    assert.equal(escaparHtml(0), '0');
    assert.equal(escaparHtml(15.5), '15.5');
  });
});
