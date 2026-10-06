# Academia Decam — Backend + Frontend conectados a MySQL

Plataforma de gestión académica con 4 roles (Docente, Alumno, Jefe Académico y Registrador).
Estado actual: **las 12 historias de usuario funcionan de punta a punta** (navegador → API REST →
MySQL), con validaciones y permisos por rol en el servidor, lógica en funciones puras y pruebas
unitarias y de API. El caso de uso final del curso es **HU-008**: ver [`docs/caso-hu-008.md`](docs/caso-hu-008.md)
y la matriz HU → criterio → prueba en [`docs/trazabilidad.md`](docs/trazabilidad.md).

## Arquitectura de 3 capas

| Capa | Archivo(s) | Corre en |
|---|---|---|
| Presentación | `dashboard.html` + `js/presentacion-*.js` (un archivo por rol o módulo) + `js/api-cliente.js` | Navegador |
| Lógica de Negocio | `logica-docente.js` (= `js/logica-docente.js`), `logica-auth.js` | **Navegador y servidor** / servidor |
| Datos | `routes/*.js` + `middleware/auth.js` + `config/db.js` + MySQL | Servidor |

La capa de Lógica son funciones puras: sin DOM, sin SQL y sin leer el reloj (la fecha llega por
parámetro). Por eso se prueban con `node`, sin navegador ni base de datos.

## 1. MySQL en Mac (Homebrew)
```bash
brew install mysql@8.4
echo 'export PATH="/opt/homebrew/opt/mysql@8.4/bin:$PATH"' >> ~/.zprofile
brew services start mysql@8.4
mysql -u root -e "SELECT VERSION();"     # debe mostrar 8.4.x
```
Homebrew instala `root` **sin contraseña**; el `.env` ya lo asume.

## 2. Crear la base de datos y cargar datos de prueba
```bash
npm run db:reset      # borra la BD, crea las 14 tablas y carga los datos de prueba
npm run db:check      # 14 controles de integridad entre tablas (todos deben salir OK)
npm run docs:db       # regenera el diccionario de datos y el diagrama entidad-relación
```
Todo lo de la base de datos vive en [`database/`](database/README.md): esquema, datos de prueba,
controles de integridad y el [diccionario de datos](database/diccionario-de-datos.md). Después de un
`git pull` que cambie el esquema, vuelve a correr `npm run db:reset`.

## 3. Configuración
```bash
cp .env.example .env         # y pon tu password de MySQL si root la tiene
```

## 4. Levantar todo
```bash
npm install
npm run dev
```
Abre <http://localhost:3001/dashboard.html>. Al reiniciar el servidor la sesión se pierde y hay que
volver a iniciar sesión (las sesiones viven en memoria).

## Usuarios de prueba

Elige la pestaña del rol y entra con (el cuadro de la pantalla de login los autocompleta al hacer clic):

| Rol | Correo | Contraseña |
|---|---|---|
| Docente | `prof@acadecam.edu.pe` | `decam2024` |
| Alumno (6-A) | `alumno@acadecam.edu.pe` | `alumno2024` |
| Jefe Académico | `jefe@acadecam.edu.pe` | `jefe2024` |
| Registrador | `registrador@acadecam.edu.pe` | `reg2024` |

Hay 3 docentes más (`rosa.quispe@…`, `jorge.mendoza@…`, `carmen.vilca@…`, con `decam2024`) y 14 alumnos más
(`ana.torres@…`, `luis.perez@…`, etc., con `alumno2024`).
En la base las contraseñas están como **hash bcrypt (costo 10)**, nunca en texto plano.

**Seguridad (RNF-02):** tras **5 intentos fallidos seguidos** la cuenta se bloquea **10 minutos**
(incluso con la contraseña correcta). Para desbloquearla en desarrollo: `npm run db:reset`.

## 5. Pruebas
```bash
npm test               # unitarias (capa de Lógica) + de API (Express + MySQL real)
npm run test:unit      # solo las unitarias (node:test, sin base de datos)
npm run test:api       # recrea academia_decam_test y prueba la API contra ella
npm run test:coverage  # todo lo anterior con reporte de cobertura
```
Las pruebas de API usan una base aparte (`academia_decam_test`): nunca tocan la de desarrollo.
Cubren, por cada HU, el caso feliz, los datos inválidos (clases de equivalencia y valores límite),
el rol incorrecto (401/403) y la integridad de la base después de cada operación.

## API REST

Toda la API exige sesión (cookie `decam.sid`) salvo `POST /api/auth/login`.
Sin sesión responde **401**; con una sesión de rol no permitido, **403**; con datos inválidos, **400**
(con `errores[]` cuando hay más de uno); si el recurso no existe, **404**; si choca con uno existente, **409**.
Un docente solo opera sobre las secciones donde dicta (HORARIO) o de las que es tutor.

| Método | Ruta | HU | Roles | Qué hace |
|---|---|---|---|---|
| POST | `/api/auth/login` | HU-001 | público | Valida correo, contraseña y rol; abre sesión |
| POST | `/api/auth/logout` | HU-001 | cualquiera | Cierra la sesión |
| GET | `/api/auth/me` | HU-001 | con sesión | Devuelve el usuario de la sesión |
| GET | `/api/secciones` | — | con sesión | Secciones reales; llena los combos de grupo |
| GET | `/api/registros?tipo&busqueda` | HU-002 | registrador | Alumnos, docentes y apoderados registrados |
| POST | `/api/registros` | HU-002 | registrador | Registra un alumno (y lo matricula si trae sección), docente o apoderado |
| GET | `/api/matriculas?estado&busqueda` | HU-004 | registrador | Matrículas filtradas por estado y búsqueda |
| POST | `/api/matriculas` | HU-003 | registrador | Matrícula con código correlativo MAT-NNNN (crea al alumno si es nuevo) |
| PATCH | `/api/matriculas/:id/estado` | HU-004 CA-002 | registrador | Alterna activa/inactiva (el alumno la acompaña) |
| GET | `/api/calificaciones?id_seccion&estado&busqueda` | HU-005 CA-003 | docente, jefe | Cuadro de notas con los filtros |
| PATCH | `/api/calificaciones/:id` | HU-005 CA-001 | docente | Cambia una nota y recalcula el promedio (en una transacción) |
| GET | `/api/asistencia?id_seccion&fecha` | HU-008 CA-001 | docente, jefe | Lista del grupo con lo ya guardado en esa fecha |
| POST | `/api/asistencia` | HU-008 CA-003 | docente | Guarda el pase de lista (el docente sale de la sesión) |
| GET | `/api/tareas?id_seccion&estado` | HU-010 CA-002 | docente, jefe | Tareas con estado derivado de la fecha límite |
| POST | `/api/tareas` | HU-010 CA-001 | docente | Publica una tarea (con su `tipo`) |
| GET | `/api/tareas/:id/entregas` | HU-010 | docente, jefe | Lista del grupo con quién entregó |
| POST | `/api/tareas/:id/entregas` | HU-010 | docente | Marca la entrega de un alumno |
| DELETE | `/api/tareas/:id/entregas/:id_alumno` | HU-010 | docente | Desmarca una entrega |
| GET | `/api/mi/calificaciones` | HU-007 | alumno | Sus notas por periodo con promedio y estado |
| GET | `/api/mi/asistencia` | HU-009 | alumno | Sus registros e indicadores acumulados |
| GET | `/api/mi/tareas?estado` | HU-010 CA-003 | alumno | Tareas de su sección con el estado de SU entrega |
| POST / DELETE | `/api/mi/tareas/:id/entrega` | HU-010 CA-003 | alumno | Marca o desmarca su propia entrega |
| GET | `/api/reclamos?estado` | HU-011 | alumno, docente, jefe | Los propios (alumno, docente) o todos (jefe) |
| POST | `/api/reclamos` | HU-011 CA-001/002 | alumno, docente | Registra el reclamo en estado pendiente |
| PATCH | `/api/reclamos/:id/estado` | HU-011 CA-003 | jefe | Pendiente → En revisión → Resuelto |
| GET | `/api/avisos` | HU-012 | con sesión | Avisos dirigidos al rol de la sesión |
| POST | `/api/avisos` | HU-012 CA-001 | jefe | Publica un aviso |
| GET | `/api/resumen` | Inicio | con sesión | Tarjetas y paneles de Inicio del rol |
| GET | `/api/perfil` | Perfil | con sesión | Datos reales del perfil |
| POST | `/api/auth/contrasena` | Perfil | con sesión | Cambia la contraseña (exige la actual) |
| GET | `/api/horario` | — | docente, alumno | Horario semanal organizado por día y hora |
| GET | `/api/seccion` | — | docente, alumno | Sección de la que es tutor / su sección |
| GET | `/api/alumnos` | — | docente | Directorio de sus alumnos con promedio, asistencia y desempeño |
| GET / POST | `/api/mensajes` | — | con sesión | Bandejas de recibidos/enviados y envío de mensajes |
| PATCH | `/api/mensajes/:id/leido` | — | destinatario | Marca un mensaje como leído |

Comprobación rápida sin navegador:
```bash
curl -c cookies.txt -H "Content-Type: application/json" -X POST \
  -d '{"correo":"prof@acadecam.edu.pe","contrasena":"decam2024","rol":"docente"}' \
  http://localhost:3001/api/auth/login
curl -b cookies.txt "http://localhost:3001/api/calificaciones?estado=Desaprobado"
```

## Cambios en el esquema (actualizar el diccionario de datos del informe)

Se agregaron 6 columnas (`usuario.intentos_fallidos`, `usuario.bloqueado_hasta`, `tarea.tipo`,
`apoderado.correo`, `apoderado.fecha_registro`, `matricula.procedencia`), 6 restricciones únicas,
14 reglas CHECK y 10 índices. La lista completa, con el motivo de cada cambio, está en
[`database/README.md`](database/README.md#cambios-respecto-al-diccionario-de-datos-del-informe-sección-45).

## Estructura del proyecto

```
dashboard.html, js/        Presentación (navegador); js/api-cliente.js es el cliente HTTP compartido
logica-*.js                Lógica de negocio: funciones puras, sin DOM ni SQL (copia idéntica en js/)
routes/, middleware/       API REST, control de acceso por rol y manejo uniforme de errores
datos/                     Altas compartidas (alumno, apoderado, matrícula) y helper de transacciones
config/db.js               Conexión a MySQL
database/                  Esquema, datos de prueba, controles de integridad y diccionario de datos
scripts/                   Utilidades (diccionario de datos, base de pruebas)
tests/                     Pruebas unitarias (Lógica) y tests/api/ (API contra MySQL)
```

## Avance por historia de usuario

| HU | Estado |
|---|---|
| HU-001 Login con acceso por rol | Hecho (bcrypt, sesión, permisos por rol en el servidor, bloqueo por intentos) |
| HU-002 / HU-003 / HU-004 (Registrador) | Hecho: registro, matrícula con código correlativo y control de estado, contra MySQL |
| HU-005 / HU-006 / HU-008 / HU-010 (Docente) | Hecho: notas, exportación CSV, asistencia y tareas con entregas por alumno |
| HU-007 / HU-009 / HU-010 CA-003 (Alumno) | Hecho: sus notas, su calendario de asistencia y el marcado de sus entregas |
| HU-011 Reclamos / HU-012 Avisos | Hecho: el Jefe atiende reclamos y publica avisos; cada rol ve los suyos |
| Pantallas sin HU (Inicio, Perfil, Horario, Sección, Mis Alumnos, Mensajes) | Con datos reales de la BD; sin botones falsos |

## Pendientes conocidos

- La etiqueta de grupo (`grado-letra`, p. ej. "6-A") no distingue el nivel: Primaria 1-A y Secundaria
  1-A se verían igual (los datos de prueba evitan esa coincidencia).
- La sesión vive en memoria del servidor (MemoryStore): al reiniciar el servidor hay que volver a iniciar
  sesión. Para producción conviene un almacén persistente (p. ej. MySQL).
