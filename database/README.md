# Base de datos — Academia Decam

MySQL 8 · InnoDB · utf8mb4 · **14 tablas**, 106 columnas, 23 llaves foráneas, 14 reglas CHECK.

## Contenido de la carpeta

| Archivo | Para qué sirve |
|---|---|
| `schema.sql` | Estructura: tablas, llaves, restricciones, índices y un `COMMENT` por columna. Re-ejecutable. |
| `seed.sql` | Datos de prueba coherentes en las 14 tablas. Idempotente. |
| `reset.sql` | Borra toda la base (solo desarrollo). |
| `verificar-integridad.sql` | 14 controles que cruzan tablas; **todos deben dar 0**. |
| `diccionario-de-datos.md` | Diccionario de datos + diagrama entidad-relación, **generado** desde la base. |

## Comandos

```bash
npm run db:reset    # borra y recrea todo: reset.sql + schema.sql + seed.sql
npm run db:check    # ejecuta los 14 controles de integridad (deben salir todos en OK)
npm run docs:db     # regenera database/diccionario-de-datos.md desde la base
```

Si traes un `schema.sql` nuevo (por ejemplo después de un `git pull`), corre `npm run db:reset`:
`CREATE TABLE IF NOT EXISTS` no modifica una tabla que ya existe.

## Modelo

Cuatro bloques (detalle de cada columna en [diccionario-de-datos.md](diccionario-de-datos.md)):

| Bloque | Tablas |
|---|---|
| Personas y acceso | `usuario`, `docente`, `apoderado` |
| Organización académica | `seccion`, `alumno`, `matricula`, `horario` |
| Gestión académica | `calificacion`, `asistencia`, `tarea`, `entrega_tarea` |
| Comunicación | `reclamo`, `aviso`, `mensaje` |

Convención de nombres de las restricciones: `uq_` única, `chk_` verificación, `fk_` llave foránea,
`idx_` índice de consulta.

## Cambios respecto al diccionario de datos del informe (sección 4.5)

Los nombres de tablas y columnas del esquema original del proyecto (que corresponde al diccionario del
informe) se respetan. Lo siguiente es **lo que se agregó** y debe reflejarse en el informe:

**6 columnas nuevas**

| Tabla | Columna | Motivo |
|---|---|---|
| `usuario` | `intentos_fallidos TINYINT UNSIGNED NOT NULL DEFAULT 0` | RNF-02: cuenta los fallos de inicio de sesión |
| `usuario` | `bloqueado_hasta DATETIME NULL` | RNF-02: hasta cuándo dura el bloqueo de la cuenta |
| `tarea` | `tipo ENUM('Tarea','Examen','Proyecto','Exposición') NOT NULL DEFAULT 'Tarea'` | HU-010: el formulario pide el tipo |
| `apoderado` | `correo VARCHAR(100) NULL` (con `chk_apoderado_correo`) | HU-003: el formulario de matrícula pide el correo del apoderado |
| `apoderado` | `fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | HU-002 CA-001: el listado de Registro muestra la fecha de creación de cada persona |
| `matricula` | `procedencia ENUM('nuevo','traslado','promocion') NOT NULL DEFAULT 'nuevo'` | HU-003: el formulario de matrícula pide la procedencia del alumno |

**6 restricciones únicas nuevas**

| Tabla | Regla |
|---|---|
| `docente` y `alumno` | `id_usuario` único: una cuenta de usuario pertenece a lo sumo a un docente o alumno |
| `seccion` | `(nivel, grado, letra, anio_lectivo)`: no puede haber dos secciones iguales |
| `matricula` | `(id_alumno, anio_lectivo)`: una matrícula por alumno y año |
| `horario` | `(id_seccion, dia_semana, hora_inicio)` y `(id_docente, dia_semana, hora_inicio)`: una sección no tiene dos clases a la vez ni un docente está en dos aulas |

**14 reglas CHECK nuevas**

| Tabla | Regla |
|---|---|
| `usuario` | `correo` con formato válido (`chk_usuario_correo`); `intentos_fallidos <= 5` |
| `docente`, `apoderado`, `alumno` | `dni` de exactamente 8 dígitos |
| `apoderado` | `correo` vacío o con formato válido (`chk_apoderado_correo`) |
| `seccion` | Grado 1–6 en Primaria y 1–5 en Secundaria (HU-003 CA-002); letra de la A a la Z |
| `matricula` | `codigo` con formato `MAT-NNNN` (HU-003 CA-001) |
| `calificacion` | Notas y promedio entre 0 y 20; periodo `Bimestre I` a `Bimestre IV` |
| `entrega_tarea` | Si el estado es `entregada`, `fecha_entrega_real` es obligatoria |
| `horario` | `hora_fin > hora_inicio` |
| `reclamo` | `tipo` ∈ calificacion, asistencia, trato, administrativo, otro |

**10 índices de consulta** (`idx_*`) en las columnas que más se filtran: `usuario(rol, estado)`,
`alumno(id_seccion, estado)`, `matricula(id_seccion, estado)`, `calificacion(id_seccion, periodo)`,
`asistencia(id_seccion, fecha)`, `tarea(id_seccion, fecha_entrega)`, `reclamo(estado, prioridad)`,
`reclamo(fecha_registro)`, `aviso(fecha_publicacion)` y `mensaje(id_destinatario, leido, fecha_envio)`.

**Otros:** cada llave foránea tiene nombre propio (`fk_<hija>_<padre>`), cada tabla y columna tiene
`COMMENT`, y los tipos y las reglas de borrado/actualización del esquema original no se modificaron.

## Datos de prueba

`seed.sql` carga: 4 docentes, 4 secciones (6-A, 5-A y 6-B de Primaria; 3-A de Secundaria), 15 alumnos
(uno retirado, con matrícula inactiva), 14 apoderados, 15 matrículas `MAT-0001` a `MAT-0015`,
calificaciones del Bimestre I, asistencia de los últimos 30 días, 8 tareas con sus entregas,
6 reclamos, 5 avisos, 6 mensajes y 75 bloques de horario.

Las fechas de tareas, asistencia, reclamos, avisos y mensajes son **relativas a hoy**, para que la
demo siempre se vea al día (qué tarea está "atrasada" depende de la fecha actual).

| Rol | Correo | Contraseña |
|---|---|---|
| Docente | `prof@acadecam.edu.pe` (y `rosa.quispe@`, `jorge.mendoza@`, `carmen.vilca@`) | `decam2024` |
| Alumno (6-A) | `alumno@acadecam.edu.pe` (y los otros 14 alumnos) | `alumno2024` |
| Jefe Académico | `jefe@acadecam.edu.pe` | `jefe2024` |
| Registrador | `registrador@acadecam.edu.pe` | `reg2024` |

## Integridad: qué garantiza cada nivel

1. **Estructura** (`schema.sql`): tipos, llaves foráneas, únicas y CHECK. La base rechaza datos
   inválidos aunque el error venga de la aplicación (probado con 18 casos inválidos).
2. **Reglas entre tablas** (`verificar-integridad.sql`): lo que MySQL no puede expresar con un
   CHECK, por ejemplo que un alumno activo tenga matrícula activa en su sección, que el promedio
   coincida con las notas o que la asistencia sea de la sección del alumno.
3. **Reglas de negocio** (capa de Lógica en la aplicación): aprobado desde 11.00, bloqueo de
   cuenta, etc.

## Limitaciones conocidas

- La etiqueta de grupo (`grado-letra`, p. ej. "6-A") no distingue el nivel: Primaria 1-A y Secundaria
  1-A se mostrarían igual. Los datos de prueba evitan esa coincidencia.
