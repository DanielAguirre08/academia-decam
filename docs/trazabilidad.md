# Matriz de trazabilidad: HU → criterio de aceptación → prueba

Fuente de las HU y de sus criterios: informe del curso, sección "Historias de Usuario y Criterios de
Aceptación". Las pruebas se ejecutan con `npm test` (unitarias + API) o `npm run test:coverage`.

**Tipos de evidencia**

- **U** — prueba unitaria de la capa de Lógica (`tests/*.test.js`, sin base de datos).
- **API** — prueba de API contra MySQL real (`tests/api/*.test.js`, base `academia_decam_test`).
- **UI** — verificación manual en el navegador (comportamiento puramente visual). Cada una está
  descrita con el paso que se hizo.

La notación `archivo › describe › prueba` permite buscar la prueba exacta con `grep`.

---

## HU-001 — Inicio de sesión con acceso diferenciado por rol

| CA | Evidencia |
|---|---|
| CA-001 Acceso con credenciales válidas y menú según el rol | **API** `auth.test.js › CA-001: login correcto devuelve el usuario sin el hash y abre sesión` · **U** `logica-auth.test.js › validarCredenciales…`, `validarRol…` · **UI** login con los 4 roles: el menú lateral muestra solo las opciones del rol (prueba de humo de las 32 páginas). |
| CA-002 Rechazo si las credenciales no son del rol elegido («Correo o contraseña incorrectos») | **API** `auth.test.js › CA-002: correo inexistente y rol equivocado dan el mismo mensaje genérico` · **U** `logica-auth.test.js › CA-002: rolCoincide…` |
| CA-003 Etiquetas «Calificaciones / Mis Calificaciones», etc. | **U** `logica-auth.test.js › CA-003: etiquetaRol…` · **UI** docente ve «Calificaciones/Asistencia/Tareas»; alumno ve «Mis Calificaciones/Mi Asistencia/Mis Tareas». |
| RNF-02 Bloqueo tras 5 intentos | **U** `logica-auth.test.js › RNF-02 — bloqueo…` (5 pruebas) · **API** `auth.test.js › RNF-02: el 5.º intento fallido bloquea la cuenta (423)…` |
| Permisos por rol en el servidor (todas las HU) | **API** en cada archivo, casos `sin sesión -> 401` y `… -> 403`. |

## HU-002 — Registro de alumnos, docentes y apoderados

| CA | Evidencia |
|---|---|
| CA-001 Guarda con fecha peruana, aparece en el listado y actualiza el contador | **U** `logica-registro.test.js › HU-002 — revisarRegistro › CA-001…`, `HU-004… › fechaPeruana…`, `filtrarRegistros…` · **API** `registro.test.js › HU-002 › CA-001: registra un apoderado con fecha peruana y aparece en el listado`, `docente: crea USUARIO + DOCENTE…`, `alumno con grado y sección…` · **UI** el contador «N registros» cambia al guardar. |
| CA-002 Campos de alumno solo con el tipo «Alumno» | **U** `logica-registro.test.js › CA-002: los campos de alumno solo se exigen para el tipo alumno` · **API** `registro.test.js › CA-002: alumno sin sus campos propios -> 400…` · **UI** al elegir Docente o Apoderado se ocultan fecha de nacimiento, sexo, nivel, grado, sección y apoderado. |
| CA-003 Sin nombre: «El nombre es obligatorio» | **U** `logica-registro.test.js › CA-003: sin nombre el único error es "El nombre es obligatorio"` · **API** `registro.test.js › CA-003: sin nombre no registra…` · **UI** toast con el mensaje exacto. |
| Integridad (DNI y correo únicos, transacción) | **API** `DNI repetido -> 409…`, `correo ya usado -> 409 y la transacción no deja un docente a medias`, `sección inexistente -> 400 y NO queda el alumno creado (rollback)`, `apoderado nuevo sin teléfono -> 400…` |

## HU-003 — Registro de matrícula del alumno

| CA | Evidencia |
|---|---|
| CA-001 Código correlativo MAT-0001, fecha del día, estado «Activa» | **U** `logica-registro.test.js › HU-003 CA-001 — código correlativo MAT-0001` (3 pruebas) · **API** `registro.test.js › CA-001: alumno nuevo -> crea alumno, apoderado y matrícula activa con código correlativo`, `concurrencia: 5 matrículas simultáneas reciben 5 códigos distintos y consecutivos` |
| CA-002 Grados según el nivel (Primaria 1-6, Secundaria 1-5) | **U** `logica-registro.test.js › HU-003 CA-002 — grados según el nivel` · **API** `registro.test.js › CA-002: grado que no corresponde al nivel -> 400` · **UI** el combo de grado está deshabilitado sin nivel y ofrece 6 o 5 grados. |
| CA-003 Campos (*) obligatorios con el mensaje de la HU | **U** `logica-registro.test.js › CA-003: falta cualquier campo (*) -> el mensaje exacto de la HU` · **API** `registro.test.js › CA-003: falta un campo (*) -> 400 con el mensaje exacto, sin insertar` |
| Integridad | **API** `el mismo alumno otra vez en el mismo año -> 409`, `turno distinto al de la sección -> 400`, controles 01-03 verificados después de cada alta (`controlesDeMatricula()`). |

## HU-004 — Consulta y control del estado de las matrículas

| CA | Evidencia |
|---|---|
| CA-001 Filtro por estado y contador | **U** `logica-registro.test.js › CA-001: filtra por estado` · **API** `registro.test.js › HU-004 › CA-001: filtra por estado` · **UI** el contador muestra «1 matrícula» con el filtro «Inactiva». |
| CA-002 Alternar activa ↔ inactiva conservando el código | **U** `CA-002: alterna activa <-> inactiva` · **API** `CA-002: activa -> inactiva conserva el código y deja al alumno inactivo`, `CA-002: inactiva -> activa reactiva al alumno en su sección`, `el alumno inactivo deja de aparecer en la asistencia del docente` |
| CA-003 Búsqueda sin resultados: mensaje y contador en cero | **U** `CA-003: una búsqueda sin resultados devuelve lista vacía` · **API** `CA-003: búsqueda sin resultados -> lista vacía` · **UI** «No hay matrículas que coincidan.» y «0 matrículas». |

## HU-005 — Registro de calificaciones por sección

| CA | Evidencia |
|---|---|
| CA-001 Promedio y estado automáticos (Aprobado ≥ 11.00) | **U** `logica-docente.test.js › HU-005 — calcularPromedio / determinarEstado` (13 pruebas, con valores límite 10.99 / 11.00 / 0 / 20) · **API** `calificaciones.test.js › PATCH … CA-001` (caso feliz, nota 0, borrar nota, control 04) |
| CA-002 Confirmación visual del guardado | **UI** cada nota se guarda al cambiarla (PATCH) y se muestra el toast con el nuevo promedio; el botón «Guardar» muestra «Guardado» en verde. |
| CA-003 Filtros por grupo, estado y nombre | **U** `CA-003: filtrarCalificaciones combina grupo + estado + nombre` · **API** `calificaciones.test.js › CA-003: filtra por grupo / por estado / por nombre…` |
| Datos inválidos y permisos | **API** `datos inválidos -> 400 y la nota no cambia` (7 clases inválidas), `calificación inexistente -> 404 (no 500)`, `docente que no dicta en el grupo -> 403…` |

## HU-006 — Exportación del cuadro de calificaciones

| CA | Evidencia |
|---|---|
| CA-001 CSV con las columnas Nombre, Grupo, Examen 1, Examen 2, Tareas, Proyecto, Promedio y Estado | **U** `logica-docente.test.js › HU-006 — Exportar CSV` (6 pruebas: BOM UTF-8, encabezados exactos, RFC 4180, inyección de fórmulas) · **UI** el archivo descargado abre en Excel con tildes correctas. |
| CA-002 Sin calificaciones: «Sin calificaciones para exportar» | **UI** con el filtro sin resultados, el botón Exportar muestra el mensaje exacto y no descarga nada. |

## HU-007 — Consulta de calificaciones del alumno

| CA | Evidencia |
|---|---|
| CA-001 Solo sus calificaciones, con promedio | **U** `logica-alumno.test.js › HU-007 — mis calificaciones` · **API** `alumno.test.js › CA-001: solo sus notas…`, `CA-001: no expone otras notas aunque se pida otro alumno por parámetro (IDOR)` |
| CA-002 Sin edición, sin guardar ni exportar, aviso de solo lectura | **API** `alumno.test.js › CA-002: el alumno no puede editar notas ni ver el cuadro del grupo` · **UI** la tabla no tiene campos editables, no hay botones Guardar/Exportar y se ve el aviso de solo lectura. |

## HU-008 — Registro de asistencia diaria por grupo  *(caso de uso final, ver `docs/caso-hu-008.md`)*

| CA | Evidencia |
|---|---|
| CA-001 Lista del grupo para la fecha elegida | **API** `asistencia.test.js › CA-001: lista del grupo para una fecha` (4 pruebas) y `CA-001 tras guardar…` · **UI** al elegir grupo y fecha se carga la lista. |
| CA-002 Sin grupo: «Selecciona un grupo» | **U** `logica-docente.test.js › HU-008 › CA-002…` (3 pruebas con valores límite de fecha) · **API** `asistencia.test.js › CA-002: grupo y fecha obligatorios y válidos` (18 pruebas) · **UI** mensaje «Selecciona un grupo» con la tabla vacía. |
| CA-003 Marcar a todos como presentes y guardar | **U** `CA-003: marcarAsistenciaTodos…` y las 5 pruebas de `validarRegistrosAsistencia` · **API** `asistencia.test.js › CA-003: guardar el pase de lista` (6 pruebas) · **UI** «Todos presentes» marca a todos y permite cambiar filas antes de guardar. |

## HU-009 — Consulta del historial de asistencia del alumno

| CA | Evidencia |
|---|---|
| CA-001 Calendario del mes en curso con los días registrados | **U** `logica-alumno.test.js › HU-009 — calendario mensual › CA-001…` · **API** `alumno.test.js › HU-009 — Mi asistencia` |
| CA-002 Fines de semana y días futuros sin estado y atenuados | **U** `CA-002: sábados y domingos son no lectivos…`, `CA-002: el día siguiente a hoy ya es futuro (valor límite)` · **UI** opacidad reducida en esos días. |
| CA-003 Tarjetas de días registrados, faltas, tardanzas y % | **U** `logica-alumno.test.js › HU-009 CA-003 — indicadores` · **API** `alumno.test.js › devuelve solo sus registros… y los indicadores coinciden con la BD` |

## HU-010 — Gestión de tareas y evaluaciones

| CA | Evidencia |
|---|---|
| CA-001 Registra la tarea del grupo con estado pendiente | **U** `logica-docente.test.js › HU-010 › CA-001…` (5 pruebas con valores límite de fecha y longitudes) · **API** `tareas.test.js › POST /api/tareas — CA-001` |
| CA-002 Filtro por estado; mensaje si no hay | **U** `CA-002: filtrarTareasPorEstado`, `determinarEstadoEntrega…` · **API** `tareas.test.js › GET /api/tareas — CA-002` · **UI** «Sin tareas atrasadas!» / «Sin tareas entregadas.» |
| CA-003 El alumno no crea ni edita; solo consulta y marca sus entregas | **U** `logica-alumno.test.js › HU-010 CA-003 — estado de mi tarea` · **API** `alumno.test.js › HU-010 CA-003 — Mis tareas` (7 pruebas, con anti-IDOR) · **UI** aviso de acceso restringido y sin botón «Nueva tarea». |
| Seguimiento del cumplimiento por el docente | **API** `tareas.test.js › Seguimiento de entregas por alumno (docente)` (8 pruebas) |

## HU-011 — Registro y seguimiento de reclamos académicos

| CA | Evidencia |
|---|---|
| CA-001 Estado inicial «Pendiente», autor y fecha automáticos | **API** `comunicacion.test.js › CA-001: estado inicial pendiente; autor y fecha los pone el servidor` |
| CA-002 Asunto y descripción obligatorios | **U** `logica-comunicacion.test.js › CA-002…` · **API** `CA-002: sin asunto o sin descripción no se registra (mensaje de la HU)` |
| CA-003 El Jefe avanza Pendiente → En revisión → Resuelto | **U** `CA-003: secuencia…`, `CA-003: etiquetas y filtro por estado` · **API** `CA-003: solo el jefe avanza el estado…`, `CA-003: Pendiente -> En revisión -> Resuelto, y ahí se detiene (409)`, `CA-003: el filtro por estado refleja el cambio` |

## HU-012 — Publicación de avisos institucionales

| CA | Evidencia |
|---|---|
| CA-001 Publica con fecha, aparece en el listado y en el contador del menú | **U** `logica-comunicacion.test.js › HU-012 — Avisos` · **API** `comunicacion.test.js › CA-001: el jefe publica con fecha del servidor…`, `CA-001: cada rol ve los avisos dirigidos a él` · **UI** el contador del menú sube de 5 a 6. |
| CA-002 Alumno y docente solo consultan; el botón de publicar está oculto | **API** `CA-002: alumno, docente y registrador consultan pero no publican (403)`, `la base sigue íntegra: todo aviso lo publicó un Jefe Académico (control 11)` · **UI** sin botón «Nuevo aviso». |

## HU-013 — Mensajes con buscador de destinatarios  *(nueva, no está en el informe del curso)*

El campo «Para» de Redactar ya no pide el correo exacto: sugiere personas mientras se escribe, como
en un aula virtual. La regla de alcance está en `datos/destinatarios.js`.

| CA | Evidencia |
|---|---|
| CA-001 Sugiere desde 2 letras, por nombre, apellido o correo, sin distinguir mayúsculas ni tildes; como máximo 8 | **U** `logica-comunicacion.test.js › HU-013 — Buscador de destinatarios` · **API** `mensajes.test.js › con menos de 2 letras…`, `sin distinguir mayúsculas ni tildes…`, `varias palabras en cualquier orden…`, `"%" y "_" se buscan literalmente…`, `nunca aparece uno mismo, y como máximo 8 resultados` · **UI** «ana» muestra a Ana Torres (Alumno · 6-A); Enter o clic la agrega como etiqueta; ↑/↓ mueven la selección; Esc cierra la lista sin cerrar el modal; Backspace con el campo vacío quita la última etiqueta. |
| CA-002 Solo se puede escribir a quien comparte clases (alumno → sus docentes y el personal; docente → sus alumnos, docentes y personal; jefe y registrador → todos), al buscar y al enviar | **API** `alumno: encuentra a los docentes de su sección…`, `docente: solo los alumnos de las secciones donde dicta o es tutor`, `docente: el alumno retirado ya no aparece`, `fuera de su alcance o inexistente -> 404 con el mismo texto…`, `la regla es simétrica…` |
| CA-003 Un mensaje a varios destinatarios (1 a 20, sin repetir), todos o ninguno | **U** `HU-013: lista de id_usuario…`, `HU-013: máximo 20 destinatarios DISTINTOS…`, `HU-013: destinatariosUnicos…` · **API** `un mensaje por destinatario (sin repetir)…`, `lista inválida -> 400 sin guardar nada` |

---

## Controles de integridad de la base (`npm run db:check`)

Las pruebas de API comprueban, después de las operaciones que podrían romperlos, los controles
01-03 (matrícula), 04 (promedio), 06 (asistencia), 07 (entregas), 11 (avisos) y 12 (mensajes) de
`database/verificar-integridad.sql`. `npm run db:check` sobre la base de desarrollo da 14/14 en OK.
