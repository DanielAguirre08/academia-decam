/**
 * Genera database/diccionario-de-datos.md leyendo la base de datos REAL (information_schema),
 * así el diccionario nunca se desactualiza respecto al esquema.
 *
 *   npm run docs:db        (necesita MySQL encendido y la base cargada con  npm run db:reset )
 *
 * Los textos de la columna "Descripción" salen de los COMMENT de database/schema.sql.
 */
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const BD = process.env.DB_NAME || 'academia_decam';
const SALIDA = path.join(__dirname, '..', 'database', 'diccionario-de-datos.md');

// Orden y agrupación lógica de las tablas en el documento.
const MODULOS = [
  ['1. Personas y acceso', ['usuario', 'docente', 'apoderado']],
  ['2. Organización académica', ['seccion', 'alumno', 'matricula', 'horario']],
  ['3. Gestión académica', ['calificacion', 'asistencia', 'tarea', 'entrega_tarea']],
  ['4. Comunicación', ['reclamo', 'aviso', 'mensaje']],
];

const celda = (t) => String(t === null || t === undefined || t === '' ? '—' : t).replace(/\|/g, '\\|').replace(/\n/g, ' ');
// CHECK_CLAUSE llega con escapes de MySQL (_utf8mb4\'...\'); se deja legible.
const limpiarCheck = (c) => c.replace(/_utf8mb4\\?'/g, "'").replace(/\\'/g, "'").replace(/`/g, '').replace(/\s+/g, ' ').trim();

async function main() {
  const q = async (sql) => (await pool.query(sql, [BD]))[0];

  const tablas = await q(`SELECT TABLE_NAME AS t, TABLE_COMMENT AS c FROM information_schema.TABLES
                          WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`);
  const columnas = await q(`SELECT TABLE_NAME AS t, COLUMN_NAME AS col, COLUMN_TYPE AS tipo, DATA_TYPE AS dt, IS_NULLABLE AS nulo,
                                   COLUMN_KEY AS clave, COLUMN_DEFAULT AS def, EXTRA AS extra, COLUMN_COMMENT AS c
                            FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`);
  const fks = await q(`SELECT k.TABLE_NAME AS t, k.CONSTRAINT_NAME AS nombre, k.COLUMN_NAME AS col, k.REFERENCED_TABLE_NAME AS padre,
                              k.REFERENCED_COLUMN_NAME AS padre_col, r.UPDATE_RULE AS u, r.DELETE_RULE AS d
                       FROM information_schema.KEY_COLUMN_USAGE k
                       JOIN information_schema.REFERENTIAL_CONSTRAINTS r
                         ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
                       WHERE k.TABLE_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL
                       ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME`);
  const indices = await q(`SELECT TABLE_NAME AS t, INDEX_NAME AS nombre, NON_UNIQUE AS nu,
                                  GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ', ') AS cols
                           FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND INDEX_NAME <> 'PRIMARY'
                           GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE ORDER BY TABLE_NAME, INDEX_NAME`);
  const checks = await q(`SELECT tc.TABLE_NAME AS t, tc.CONSTRAINT_NAME AS nombre, cc.CHECK_CLAUSE AS clausula
                          FROM information_schema.TABLE_CONSTRAINTS tc
                          JOIN information_schema.CHECK_CONSTRAINTS cc
                            ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
                          WHERE tc.TABLE_SCHEMA = ? AND tc.CONSTRAINT_TYPE = 'CHECK' ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_NAME`);

  const porTabla = (lista, t) => lista.filter((x) => x.t === t);
  const esFk = (t, col) => fks.some((f) => f.t === t && f.col === col);
  const esUnico = (t, col) => indices.some((i) => i.t === t && i.nu === 0 && i.cols === col);

  const md = [];
  md.push('# Diccionario de datos — Academia Decam', '');
  md.push(`> Generado automáticamente desde la base de datos \`${BD}\` con \`npm run docs:db\`. ` +
          'No lo edites a mano: cambia los `COMMENT` de `database/schema.sql` y vuelve a generarlo.', '');
  md.push(`**Motor:** MySQL 8 · InnoDB · utf8mb4 · **${tablas.length} tablas**, ${columnas.length} columnas, ` +
          `${fks.length} llaves foráneas, ${checks.length} reglas CHECK.`, '');

  // ---- Índice ----
  md.push('## Contenido', '');
  MODULOS.forEach(([modulo, lista]) => {
    md.push(`- **${modulo}:** ` + lista.map((t) => `[\`${t}\`](#${t})`).join(' · '));
  });
  md.push('- [Diagrama entidad-relación](#diagrama-entidad-relación)', '');

  // ---- Tablas ----
  md.push('## Tablas', '');
  MODULOS.forEach(([modulo, lista]) => {
    md.push(`### ${modulo}`, '');
    lista.forEach((t) => {
      const info = tablas.find((x) => x.t === t);
      if (!info) throw new Error('La tabla ' + t + ' no existe en la base de datos');
      md.push(`#### ${t}`, '', info.c ? `_${info.c}_` : '', '');
      md.push('| Campo | Tipo | Nulo | Clave | Por defecto | Descripción |', '|---|---|---|---|---|---|');
      porTabla(columnas, t).forEach((c) => {
        const claves = [];
        if (c.clave === 'PRI') claves.push('PK');
        if (esFk(t, c.col)) claves.push('FK');
        if (c.clave === 'UNI' || esUnico(t, c.col)) claves.push('UQ');
        const def = c.def === null ? (c.nulo === 'YES' ? 'NULL' : '—') : c.def;
        const extra = /auto_increment/i.test(c.extra) ? 'AUTO_INCREMENT' : def;
        md.push(`| \`${c.col}\` | \`${c.tipo}\` | ${c.nulo === 'YES' ? 'Sí' : 'No'} | ${celda(claves.join(', '))} | ${celda(extra)} | ${celda(c.c)} |`);
      });
      md.push('');

      const restricciones = [];
      porTabla(fks, t).forEach((f) =>
        restricciones.push(`- **Clave foránea** \`${f.nombre}\`: \`${f.col}\` → \`${f.padre}(${f.padre_col})\` · ON UPDATE ${f.u}, ON DELETE ${f.d}`));
      indices.filter((i) => i.t === t && i.nu === 0).forEach((i) =>
        restricciones.push(`- **Única** \`${i.nombre}\`: (${i.cols})`));
      porTabla(checks, t).forEach((c) =>
        restricciones.push(`- **Verificación** \`${c.nombre}\`: \`${limpiarCheck(c.clausula)}\``));
      indices.filter((i) => i.t === t && i.nu === 1 && i.nombre.startsWith('idx_')).forEach((i) =>
        restricciones.push(`- **Índice** \`${i.nombre}\`: (${i.cols})`));
      if (restricciones.length) md.push('**Restricciones e índices**', '', ...restricciones, '');
    });
  });

  // ---- Diagrama ER (Mermaid), armado a partir de las llaves foráneas reales ----
  md.push('## Diagrama entidad-relación', '', '```mermaid', 'erDiagram');
  fks.forEach((f) => {
    const col = columnas.find((c) => c.t === f.t && c.col === f.col);
    const ladoPadre = col.nulo === 'YES' ? '|o' : '||';              // ¿el hijo puede no tener padre?
    const ladoHijo = esUnico(f.t, f.col) ? 'o|' : 'o{';              // ¿a lo sumo un hijo, o muchos?
    md.push(`  ${f.padre.toUpperCase()} ${ladoPadre}--${ladoHijo} ${f.t.toUpperCase()} : "${f.col}"`);
  });
  MODULOS.forEach(([, lista]) => lista.forEach((t) => {
    md.push(`  ${t.toUpperCase()} {`);
    porTabla(columnas, t).filter((c) => c.clave === 'PRI' || esFk(t, c.col) || c.clave === 'UNI').forEach((c) => {
      const marca = [c.clave === 'PRI' ? 'PK' : null, esFk(t, c.col) ? 'FK' : null, c.clave === 'UNI' ? 'UK' : null].filter(Boolean).join(', ');
      md.push(`    ${c.dt} ${c.col} ${marca}`);
    });
    md.push('  }');
  }));
  md.push('```', '');
  md.push('_En el diagrama solo se muestran las columnas clave (PK, FK y únicas); el detalle de cada tabla está arriba._', '');

  fs.writeFileSync(SALIDA, md.join('\n'), 'utf8');
  console.log(`Diccionario generado: ${path.relative(process.cwd(), SALIDA)}  (${tablas.length} tablas, ${columnas.length} columnas)`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
