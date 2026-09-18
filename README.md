# Academia Decam — Backend + Frontend conectados a MySQL

Las 3 historias de usuario del rol Docente (**HU-005 Calificaciones**, **HU-008 Asistencia**,
**HU-010 Tareas**) funcionan de punta a punta contra MySQL: el navegador ya no guarda nada
en memoria.

## Arquitectura de 3 capas

| Capa | Archivo(s) | Corre en |
|---|---|---|
| Presentación | `dashboard.html` + `js/presentacion-docente.js` | Navegador |
| Lógica de Negocio | `logica-docente.js` (= `js/logica-docente.js`) | **Navegador y servidor** |
| Datos | `routes/*.js` + `config/db.js` + MySQL | Servidor |

La capa de Lógica es el mismo archivo en los dos lados: funciones puras, sin DOM y sin SQL.
Por eso se puede probar con `node` sin navegador ni base de datos.

## 1. MySQL (Homebrew)
```bash
brew install mysql          # si no lo tienes
brew services start mysql
```

## 2. Crear la base de datos y cargar datos de prueba
```bash
mysql -u root < schema.sql   # tablas + docente + sección 6-A
mysql -u root < seed.sql     # 6 alumnos, notas, 2 tareas y la sección 5-A
```
`seed.sql` es idempotente (INSERT IGNORE): se puede volver a correr sin duplicar ni borrar.

## 3. Credenciales
```bash
cp .env.example .env         # y pon tu password de MySQL si root la tiene
```

## 4. Levantar todo
```bash
npm install
npm run dev
```
Abre <http://localhost:3001/dashboard.html> e inicia sesión como Maestro:
`prof@acadecam.edu.pe` / `decam2024`.

## 5. Pruebas unitarias de la capa de Lógica
```bash
node tests/logica-docente.test.js    # 20 pruebas, sin frameworks
```

## API REST

| Método | Ruta | HU | Qué hace |
|---|---|---|---|
| GET | `/api/secciones` | — | Secciones reales; llena los combos de grupo |
| GET | `/api/calificaciones?id_seccion&estado&busqueda` | HU-005 CA-003 | Lista con los 3 filtros |
| POST | `/api/calificaciones` | HU-005 CA-002 | Alta de alumno (USUARIO + ALUMNO + CALIFICACION, en transacción) |
| PATCH | `/api/calificaciones/:id` | HU-005 CA-001 | Cambia una nota y recalcula el promedio |
| GET | `/api/asistencia?id_seccion&fecha` | HU-008 CA-001 | Lista del grupo con lo ya guardado en esa fecha |
| POST | `/api/asistencia` | HU-008 CA-003 | Guarda el pase de lista completo |
| GET | `/api/tareas?id_seccion&estado` | HU-010 CA-002 | Tareas con estado derivado de la fecha límite |
| POST | `/api/tareas` | HU-010 CA-001 | Publica una tarea |

Comprobación rápida sin navegador:
```bash
curl "http://localhost:3001/api/calificaciones?estado=Desaprobado"
curl "http://localhost:3001/api/asistencia?id_seccion=1&fecha=2026-09-18"
curl "http://localhost:3001/api/tareas"
```

## Pendientes conocidos

- El selector **Tipo** del modal de nueva tarea (Tarea/Examen/Proyecto/Exposición) no se
  guarda: la tabla `TAREA` del diccionario de datos no tiene esa columna.
- Marcar una tarea como entregada desde la lista no persiste: la entrega es **por alumno**
  (tabla `ENTREGA_TAREA`) y la pantalla actual no tiene dónde elegir al alumno.
- El alta de alumno completa `fecha_nacimiento` y `sexo` con valores provisionales, porque
  el modal solo pide nombre, grupo y notas.
- Las tarjetas del Inicio (Alumnos registrados, Asistencia promedio…) siguen mostrando `?`:
  vienen del prototipo y no están conectadas a la API.
