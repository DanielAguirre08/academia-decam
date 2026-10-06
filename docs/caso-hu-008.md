# Caso de uso final — HU-008 Registro de asistencia diaria por grupo

Curso: Calidad y Pruebas de Software · Proyecto Academia Decam (Grupo 3)

## 1. Historia de usuario

**Como** Docente, **quiero** registrar la asistencia diaria de los alumnos de mi grupo marcando
presente, ausente o tardanza, **para** llevar un control ordenado de la participación de los
estudiantes en cada sesión de clase.

| CA | Dado / Cuando / Entonces |
|---|---|
| CA-001 | Dado que el docente está en «Control de Asistencia», cuando selecciona un grupo y la fecha, entonces se carga la lista de alumnos del grupo con las opciones de marcado habilitadas. |
| CA-002 | Dado que el docente aún no seleccionó grupo, cuando ingresa al módulo, entonces se muestra «Selecciona un grupo» y la tabla queda vacía. |
| CA-003 | Dado que la lista está cargada, cuando usa «marcar a todos como presentes», entonces todos quedan en «Presente» y se puede cambiar individualmente a ausencia o tardanza. |

## 2. Por qué esta HU

De las HU del Docente es la de menor superficie (2 endpoints, 1 tabla), sin dependencias de otros
módulos, y con entradas que se prestan a las técnicas del curso: fechas (valores límite del
calendario), identificadores (clases de equivalencia), una lista de registros (combinaciones
inválidas) y permisos por rol (tabla de decisión).

## 3. Arquitectura del flujo (3 capas)

```
Presentación                   Lógica (pura, compartida)            Datos
js/presentacion-docente.js  ─▶ logica-docente.js                ─▶ routes/asistencia.js ─▶ MySQL
  loadAttGroup()                 validarGrupoSeleccionado()         GET  /api/asistencia     ASISTENCIA
  markAll()                      validarFechaAsistencia()           POST /api/asistencia     (UNIQUE alumno,
  guardarAsistencia()            esFechaFutura()                    middleware/auth.js         sección, fecha)
                                 marcarAsistenciaTodos()              requiereRol()
                                 validarRegistrosAsistencia()         puedeOperarEnSeccion()
                                 calcularPorcentajeAsistencia()
```

La **misma** función de Lógica valida en el navegador (respuesta inmediata) y en el servidor (la
regla que realmente protege la base). Las funciones son puras: la fecha "hoy" llega por parámetro,
por eso las pruebas unitarias no dependen del reloj.

## 4. Diseño de pruebas

### 4.1 Clases de equivalencia

| Entrada | Clases válidas | Clases inválidas |
|---|---|---|
| `id_seccion` | V1 entero positivo existente donde el docente dicta | I1 vacío/ausente · I2 no numérico (`abc`, `6-A`, `1 OR 1=1`) · I3 cero o negativo · I4 decimal · I5 entero que no existe (→ 404) · I6 sección donde el docente no dicta (→ 403) |
| `fecha` | V2 `AAAA-MM-DD` real, hoy o anterior | I7 vacía · I8 otro formato (`18/09/2026`, `2026-9-18`, con hora) · I9 fecha que no existe (`2026-02-31`, `2026-02-29`, mes 13, mes 00) · I10 futura |
| `registros[]` | V3 lista no vacía de alumnos activos del grupo, sin repetidos | I11 vacía o ausente · I12 no es lista · I13 alumno de otra sección · I14 alumno inexistente · I15 alumno repetido · I16 `id_alumno` no numérico · I17 alumno inactivo del grupo |
| `estado` | V4 `presente`, `ausente`, `tardanza` | I18 cualquier otro (`tarde`, `Presente`, vacío) |
| Rol de la sesión | V5 docente (GET y POST) · V6 jefe académico (solo GET) | I19 sin sesión (→ 401) · I20 alumno (→ 403) · I21 jefe en POST (→ 403) |

### 4.2 Valores límite

| Variable | Límite | Casos |
|---|---|---|
| Fecha vs. hoy | hoy / mañana | hoy válido · mañana inválido (`esFechaFutura`) |
| Fin de mes | 28, 29, 30, 31 | `2026-02-28` válido · `2026-02-29` inválido (2026 no es bisiesto) · `2028-02-29` válido · `2026-04-31` inválido · `2026-12-31` válido |
| Mes | 00 / 01 / 12 / 13 | 00 y 13 inválidos |
| `id_seccion` | 0 / 1 | `0` inválido · `1` válido |
| % de asistencia | 0 días registrados | `null` ("Sin datos"), no 100 % |

### 4.3 Tabla de decisión de permisos

| Sesión | Rol | Dicta en el grupo | GET | POST |
|---|---|---|---|---|
| No | — | — | 401 | 401 |
| Sí | alumno | — | 403 | 403 |
| Sí | jefe académico | — | 200 | 403 |
| Sí | docente | No | 403 | 403 |
| Sí | docente | Sí | 200 | 200 |

Orden de las respuestas: **400** datos inválidos → **404** sección inexistente → **403** sección ajena.

## 5. Casos de prueba

Pruebas unitarias en `tests/logica-docente.test.js › HU-008 — Asistencia` (14) y de API en
`tests/api/asistencia.test.js` (34). Todas pasan.

| ID | Técnica | Caso | Esperado | Prueba |
|---|---|---|---|---|
| CP-01 | Tabla de decisión | GET y POST sin sesión | 401 | `Permisos por rol › GET/POST sin sesión -> 401` |
| CP-02 | Tabla de decisión | GET como alumno | 403 | `GET como alumno -> 403` |
| CP-03 | Tabla de decisión | POST como jefe / GET como jefe | 403 / 200 | `POST como jefe académico -> 403`, `GET como jefe académico -> 200` |
| CP-04 | Tabla de decisión (I6) | docente que no dicta en el grupo | 403 y nada guardado | `docente que no dicta en el grupo: GET y POST -> 403…` |
| CP-05 | CA-001 (V1, V2) | lista del grupo sin datos del día | 5 alumnos activos en «presente» por defecto | `sin nada guardado, devuelve a los 5 alumnos activos…` |
| CP-06 | CA-001 (I17) | el grupo tiene un alumno retirado | no aparece | `no incluye alumnos inactivos…` |
| CP-07 | Valor límite (% sin días) | alumno sin registros | `porcentajeAsistencia = null` | `alumno sin días registrados: porcentaje null…` |
| CP-08 | CA-002 (I1-I4, I7-I10) | 8 combinaciones inválidas × GET y POST | 400 y nada guardado | `CA-002: grupo y fecha obligatorios y válidos` (16 casos) |
| CP-09 | CA-002 (I5) | sección inexistente | 404 | `grupo que no existe -> 404` |
| CP-10 | CA-003 (I11-I16, I18) | 7 listas de registros inválidas | 400 con `errores[]` y nada guardado | `registros inválidos -> 400 con la lista de errores…` |
| CP-11 | CA-003 (I17) | alumno inactivo del grupo | 400 | `alumno inactivo de la sección -> 400` |
| CP-12 | CA-003 (V3-V5) | caso feliz; el cuerpo intenta suplantar al firmante | 200; 5 filas firmadas por el docente de la sesión | `caso feliz: guarda los 5 registros en MySQL…` |
| CP-13 | CA-001 tras CA-003 | volver a la fecha | se ve lo guardado (`guardado = true`) | `CA-001 tras guardar…` |
| CP-14 | Integridad (UNIQUE) | guardar dos veces el mismo día | actualiza, no duplica (5 filas) | `guardar otra vez el mismo día actualiza, no duplica…` |
| CP-15 | Integridad (control 06) | después de todo lo anterior | 0 asistencias en sección ajena | `la base sigue íntegra…` |
| CP-16 | Unitaria, valores límite | fechas de fin de mes, bisiesto, mes 00/13 | inválidas salvo las reales | `CA-002: fecha que no existe en el calendario…` |
| CP-17 | Unitaria (CA-003) | `marcarAsistenciaTodos` y `validarRegistrosAsistencia` | todos «presente»; detecta ajenos, repetidos e inválidos | 6 pruebas `CA-003: …` |

## 6. Defectos encontrados y corregidos durante las pruebas

| # | Defecto (antes) | Cómo se detectó | Corrección | Prueba de regresión |
|---|---|---|---|---|
| D1 | `POST /api/asistencia` guardaba alumnos de **otra sección** | Revisión del código y caso I13 | `validarRegistrosAsistencia` contra los alumnos activos de la sección | CP-10 |
| D2 | `2026-02-31` pasaba la validación (`new Date` lo corre al 3 de marzo) y MySQL respondía **500** | Valor límite de fin de mes | Validación de ida y vuelta de la fecha | CP-08, CP-16 |
| D3 | Un alumno repetido en la lista pisaba al primero sin avisar | Clase I15 | Detección de repetidos | CP-10 |
| D4 | Un `id_alumno` inexistente producía **500** (error de FK) | Clase I14 | Validación previa + `responderError` traduce FK a 400 | CP-10 |
| D5 | Se podía pasar lista de **días futuros** | Valor límite hoy/mañana | `esFechaFutura` en navegador y servidor; `max` en el selector | CP-08 |
| D6 | La fecha por defecto usaba `toISOString()` (UTC): en Perú, desde las 19:00, el día siguiente | Prueba en el navegador | `fechaLocalISO` | Prueba unitaria `fechaLocalISO…` |
| D7 | Sin días registrados el % se mostraba como **100 %** (dato inventado) | Valor límite 0 días | `calcularPorcentajeAsistencia` devuelve `null` → «Sin datos» | CP-07 |
| D8 | Cualquier docente podía pasar lista en cualquier sección | Tabla de decisión | `puedeOperarEnSeccion` (HORARIO / tutor) | CP-04 |
| D9 | El nombre del alumno se insertaba sin escapar (XSS almacenado) | Prueba con `<img onerror=…>` como nombre | `escaparHtml` en todo dato de la BD | `tests/utilidades-html.test.js` + verificación en navegador |

## 7. Resultados

- `npm test`: **286 pruebas, 286 pasan** (131 unitarias + 155 de API), sobre MySQL 8.4 real.
- HU-008: 14 pruebas unitarias + 34 de API.
- Cobertura (`npm run test:coverage`): `routes/asistencia.js` **96.6 % de líneas / 87.5 % de ramas**
  (lo único sin cubrir son los `catch` de error 500); `js/logica-docente.js` **99.5 % de líneas**.
  Total del proyecto: 96 % de líneas.
- `npm run db:check`: **14/14 controles en OK**.
- Verificación manual en Chrome: carga por grupo y fecha, «Todos presentes», cambio individual,
  guardado (filas comprobadas en MySQL), fecha por defecto local y `max` en el selector.

## 8. Cumplimiento de la definición de "100 %"

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | CA de punta a punta (UI → API → MySQL) | Cumple | CP-05, CP-12, CP-13 y verificación en navegador |
| 2 | Validaciones y permisos por rol en el servidor | Cumple | CP-01 a CP-04, CP-08 a CP-11 |
| 3 | Lógica en funciones puras con pruebas unitarias | Cumple | 14 pruebas unitarias; funciones sin DOM ni SQL |
| 4 | Pruebas de API (feliz, error, inválidos, rol incorrecto) | Cumple | 34 pruebas en `tests/api/asistencia.test.js` |
| 5 | Errores manejados y UI sin "?" ni relleno | Cumple | errores 4xx con mensaje; «Sin datos» en vez de 100 %; Inicio con datos reales |
| 6 | Persistencia respetando FK, CHECK y únicos | Cumple | CP-14, CP-15; ENUM de estado; FK validadas antes de insertar |
| 7 | Sin código muerto ni credenciales expuestas | Cumple | se eliminaron el cuadro de credenciales, `js/datos-docente.js` y 34 funciones del prototipo |

## 9. Cómo reproducir

```bash
npm install
npm run db:reset          # base de desarrollo con datos de prueba
npm run db:check          # 14 controles de integridad
npm test                  # unitarias + API (recrea academia_decam_test antes de las de API)
npm run test:coverage     # con reporte de cobertura
npm start                 # http://localhost:3001 — docente: prof@acadecam.edu.pe
```

> Las pruebas de API comparten la base `academia_decam_test` y se ejecutan en serie. Para correr
> un solo archivo, primero `npm run db:reset:test`.
