'use strict';
/**
 * Generador de la especificación OpenAPI 3 de la API de ARTEC.
 *
 * Generador autocontenido (sin dependencias externas): lee `routes/api.js`,
 * descubre todas las rutas declaradas y construye la especificación OpenAPI.
 * No sigue `require()` ni depende de librerías frágiles, por lo que funciona
 * igual en Windows y en Linux.
 *
 * Cada endpoint se descubre automáticamente (método, ruta, etiqueta, parámetros
 * de ruta y seguridad). Además, los endpoints más importantes se enriquecen a
 * mano en la tabla ENRICH con descripción, cuerpo de la petición y ejemplos de
 * respuesta. El resto queda autodescubierto.
 *
 * Ejecutar con:  npm run docs:api   (desde la carpeta backend)
 * Genera:        backend/src/docs/swagger-output.json
 * Se sirve en:   GET /api/docs   (Swagger UI, ver server.js)
 */
const path = require('path');
const fs = require('fs');

const ROUTES_FILE = path.join(__dirname, '..', 'routes', 'api.js');
const OUTPUT_FILE = path.join(__dirname, 'swagger-output.json');

// -- Reglas de etiquetado por prefijo de ruta (la primera coincidencia gana) --
const TAG_RULES = [
  [/^\/chat-history/, 'Historial'],
  [/^\/admin\/incidents/, 'Incidencias'],
  [/^\/admin/, 'Administración'],
  [/^\/auth/, 'Autenticación'],
  [/^\/(chat|visitor)/, 'Visitante / Chat'],
  [/^\/robots/, 'Robots'],
  [/^\/(maps|museums)/, 'Museos y Mapas'],
];

// Rutas accesibles sin token (login, alta de visitante, recuperación,
// disponibilidad y los flujos SSE que validan el token por query string).
const PUBLIC = [
  ['post', '/auth/login'],
  ['post', '/auth/visitor'],
  ['post', '/auth/forgot-password'],
  ['post', '/auth/reset-password'],
  ['get', '/robots/{id}/availability'],
  ['get', '/robots/stream'],
  ['get', '/robots/position-stream'],
  ['get', '/'],
];

// Verbo legible para construir un resumen aproximado de cada operación.
const VERB = { get: 'Consultar', post: 'Enviar', put: 'Actualizar', patch: 'Modificar', delete: 'Eliminar' };

// ── Helpers de enriquecimiento ──
const jsonBody = (properties, required, example) => ({
  required: true,
  content: { 'application/json': { schema: { type: 'object', required: required || [], properties }, example } },
});
const multipartBody = (properties, required) => ({
  required: true,
  content: { 'multipart/form-data': { schema: { type: 'object', required: required || [], properties } } },
});
const r = (description, example) => ({ description, content: { 'application/json': { example } } });

// ── Enriquecimiento manual de los endpoints más importantes ──
// Clave: "METHOD /ruta" (con la ruta en formato OpenAPI, p. ej. {id}).
const ENRICH = {
  'POST /auth/login': {
    summary: 'Iniciar sesión (personal y administradores)',
    description: 'Autentica con nombre de usuario o correo y contraseña. Devuelve un token JWT válido 24 h y los datos del usuario. Si la cuenta debe establecer una contraseña nueva, `must_change_password` es `true`.',
    requestBody: jsonBody(
      { identifier: { type: 'string', description: 'Nombre de usuario o correo electrónico' }, password: { type: 'string' } },
      ['identifier', 'password'],
      { identifier: 'admin', password: 'TuContrasena123' }
    ),
    responses: {
      200: r('Inicio de sesión correcto', { message: 'Login successful', token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', must_change_password: false, user: { id: 'a1b2c3', name: 'admin', email: 'admin@museo.es', role: 'museum_admin', avatar: null, museum_id: 'm-001' } }),
      400: r('Faltan credenciales', { error: 'Name/email and password are required' }),
      401: r('Credenciales incorrectas', { error: 'Credenciales incorrectas' }),
      403: r('Rol no válido o cuenta desactivada', { error: 'Esta cuenta ha sido desactivada. Contacta con tu administrador.' }),
    },
  },
  'POST /auth/visitor': {
    summary: 'Crear sesión de visitante (escaneo del QR)',
    description: 'Reserva un robot disponible y crea una sesión anónima de visitante con un token JWT válido 12 h. El robot debe estar encendido y conectado. `expertiseLevel` ajusta el nivel de detalle de las explicaciones de la IA.',
    requestBody: jsonBody(
      {
        robotId: { type: 'string', description: 'ID del robot leído del código QR' },
        name: { type: 'string', description: 'Nombre del visitante (opcional)' },
        expertiseLevel: { type: 'string', enum: ['nino', 'general', 'estudiante', 'experto'] },
        language: { type: 'string', enum: ['es', 'en', 'fr', 'de', 'it'] },
      },
      ['robotId'],
      { robotId: 'r-7f3a', name: 'María', expertiseLevel: 'general', language: 'es' }
    ),
    responses: {
      201: r('Sesión de visitante creada', { message: 'Visitor session created', token: 'eyJ...', visitor: { id: 'v-001', session_id: 's-001', role: 'visitor', robot_id: 'r-7f3a', robot_name: 'Rob-1', name: 'María', expertise_level: 'general', language: 'es' } }),
      400: r('Falta el ID del robot', { error: 'Se requiere el ID del robot leído del QR' }),
      403: r('Robot ocupado por otro visitante', { error: 'Este robot ya está siendo utilizado por otro visitante. Por favor, espera a que termine su visita.' }),
      404: r('Robot no encontrado', { error: 'Robot no válido o no encontrado' }),
      503: r('Robot fuera de línea', { error: 'El robot no está disponible en este momento. Puede estar apagado o sin conexión. Inténtalo de nuevo en unos minutos.' }),
    },
  },
  'POST /auth/forgot-password': {
    summary: 'Solicitar restablecimiento de contraseña',
    description: 'Envía por correo un enlace para restablecer la contraseña. Por seguridad responde siempre 200, exista o no la cuenta (evita enumeración de correos).',
    requestBody: jsonBody({ email: { type: 'string' } }, ['email'], { email: 'usuario@museo.es' }),
    responses: { 200: r('Solicitud procesada', { message: 'Si el correo existe, se ha enviado un enlace de recuperación.' }) },
  },
  'POST /auth/reset-password': {
    summary: 'Restablecer contraseña con token',
    description: 'Establece una contraseña nueva a partir del token de un solo uso recibido por correo (válido 1 h).',
    requestBody: jsonBody(
      { token: { type: 'string', description: 'Token recibido en el enlace del correo' }, new_password: { type: 'string', description: 'Mínimo 6 caracteres' } },
      ['token', 'new_password'],
      { token: 'a1b2c3d4...', new_password: 'NuevaContrasena123' }
    ),
    responses: {
      200: r('Contraseña actualizada', { message: 'Password reset successfully' }),
      400: r('Token inválido o expirado', { error: 'Token inválido o expirado' }),
    },
  },
  'POST /auth/change-password': {
    summary: 'Cambiar la contraseña propia',
    description: 'Cambia la contraseña del usuario autenticado. Devuelve un token nuevo. Es el flujo del cambio obligatorio en el primer acceso del personal.',
    requestBody: jsonBody(
      { current_password: { type: 'string' }, new_password: { type: 'string', description: 'Mínimo 6 caracteres' } },
      ['current_password', 'new_password'],
      { current_password: 'Temporal123', new_password: 'NuevaContrasena123' }
    ),
    responses: {
      200: r('Contraseña cambiada', { message: 'Password changed successfully', token: 'eyJ...' }),
      400: r('Datos inválidos', { error: 'New password must be at least 6 characters' }),
      401: r('Contraseña actual incorrecta', { error: 'Current password is incorrect' }),
    },
  },
  'POST /admin/create-staff': {
    summary: 'Dar de alta personal',
    description: 'Crea una cuenta de personal y le envía por correo una contraseña temporal. El administrador de plataforma puede crear `museum_admin` o `technician` (indicando `museum_id`); el administrador de museo solo `technician` de su museo.',
    requestBody: jsonBody(
      {
        name: { type: 'string' }, email: { type: 'string' },
        role: { type: 'string', enum: ['museum_admin', 'technician'] },
        museum_id: { type: 'string', description: 'Museo al que se asigna (obligatorio para platform_admin)' },
      },
      ['name', 'email', 'role'],
      { name: 'Lucía Pérez', email: 'lucia@museo.es', role: 'technician', museum_id: 'm-001' }
    ),
    responses: {
      201: r('Cuenta creada y correo enviado', { message: 'technician account created and welcome email sent.', user: { id: 'u-010', name: 'Lucía Pérez', email: 'lucia@museo.es', role: 'technician', museum_id: 'm-001' } }),
      400: r('Datos inválidos', { error: 'Name, email and role are required' }),
      409: r('Nombre o correo en uso', { error: 'That email is already taken' }),
    },
  },
  'POST /chat/message': {
    summary: 'Enviar un mensaje al robot (IA)',
    description: 'El visitante envía un mensaje en lenguaje natural. La IA (Gemini) interpreta la intención (ir a un lugar, explicar, saludar, etc.) y devuelve la respuesta adaptada a su nivel. Requiere token de visitante.',
    requestBody: jsonBody({ message: { type: 'string' } }, ['message'], { message: 'Llévame a la sala del Renacimiento' }),
    responses: { 200: r('Respuesta de la IA', { reply: 'Claro, te llevo a la Sala del Renacimiento.', intent: 'navigate_to', place: { id: 'z-12', name: 'Sala del Renacimiento', map_x: 3.2, map_y: 1.8 } }) },
  },
  'POST /chat/confirm-nav': {
    summary: 'Confirmar la navegación a un lugar',
    description: 'Tras una intención `navigate_to`, el visitante confirma el destino y el servidor lanza el objetivo Nav2 al robot real.',
    requestBody: jsonBody({ place_id: { type: 'string', description: 'ID de la zona destino' } }, ['place_id'], { place_id: 'z-12' }),
    responses: {
      200: r('Navegación iniciada', { message: 'Navegación iniciada', place: 'Sala del Renacimiento' }),
      400: r('Falta el destino', { error: 'place_id is required' }),
    },
  },
  'POST /robots': {
    summary: 'Registrar un robot nuevo',
    description: 'Crea un robot y lo asocia a un museo. Solo administrador de plataforma.',
    requestBody: jsonBody(
      { name: { type: 'string' }, museum_id: { type: 'string' } },
      ['name', 'museum_id'],
      { name: 'Robot Recepción', museum_id: 'm-001' }
    ),
    responses: {
      201: r('Robot creado', { message: 'Robot created', id: 'r-7f3a', name: 'Robot Recepción', museum_id: 'm-001', status: 'idle', battery: 100, position: { x: 0, y: 0, theta: 0 } }),
      400: r('Datos inválidos', { error: 'Name and museum_id are required' }),
    },
  },
  'POST /robots/{id}/command': {
    summary: 'Enviar un comando al robot',
    description: 'Envía una orden de teleoperación o conexión al robot. Valores de `command`: `connect`, `disconnect`, `move`, `stop`, `charge`. Para `connect` se puede indicar `payload.ip`; para `move`, `payload.linearX` y `payload.angularZ` (velocidades).',
    requestBody: jsonBody(
      {
        command: { type: 'string', enum: ['connect', 'disconnect', 'move', 'stop', 'charge'] },
        payload: { type: 'object', description: 'Parámetros del comando (ip para connect; linearX/angularZ para move)' },
      },
      ['command'],
      { command: 'move', payload: { linearX: 0.2, angularZ: 0.0 } }
    ),
    responses: {
      200: r('Comando ejecutado', { message: 'Conectado a Robot Recepción', connected: true }),
      404: r('Robot no encontrado o sin permiso', { error: 'Robot not found or unauthorized' }),
      503: r('Error iniciando la conexión', { error: 'Error iniciando la conexión: timeout' }),
      504: r('No se pudo conectar con el robot', { error: 'No se pudo conectar con "Robot Recepción" en 192.168.1.50:9090. Comprueba que el robot está encendido, en la misma red y con rosbridge_server activo.' }),
    },
  },
  'POST /museums': {
    summary: 'Crear un museo',
    description: 'Da de alta una instalación nueva. Solo administrador de plataforma.',
    requestBody: jsonBody(
      { name: { type: 'string' }, company: { type: 'string', description: 'Entidad responsable' } },
      ['name', 'company'],
      { name: 'Museo de Salamanca', company: 'Junta de Castilla y León' }
    ),
    responses: {
      201: r('Museo creado', { message: 'Museum created successfully', museum: { id: 'm-001', name: 'Museo de Salamanca', company: 'Junta de Castilla y León' } }),
      400: r('Datos inválidos', { error: 'Name and company are required' }),
    },
  },
  'POST /museums/{museum_id}/maps': {
    summary: 'Subir un mapa al museo',
    description: 'Sube el plano del museo (imagen PGM o PNG) con un YAML opcional de metadatos de ROS (`resolution`, `origin`). Los PGM se convierten a PNG automáticamente. Petición `multipart/form-data`.',
    requestBody: multipartBody(
      {
        name: { type: 'string', description: 'Nombre del mapa' },
        image: { type: 'string', format: 'binary', description: 'Imagen del mapa (.pgm o .png)' },
        yaml: { type: 'string', format: 'binary', description: 'Metadatos ROS (.yaml, opcional)' },
        resolution: { type: 'number', description: 'Metros por píxel (opcional, si no hay YAML)' },
        origin_x: { type: 'number' },
        origin_y: { type: 'number' },
      },
      ['name', 'image']
    ),
    responses: {
      201: r('Mapa creado', { message: 'Map uploaded', map: { id: 'map-1', museum_id: 'm-001', name: 'Planta baja', image_path: '/uploads/maps/abc.png', resolution: 0.05, origin_x: -10, origin_y: -10, width: 800, height: 600 } }),
      400: r('Faltan datos o imagen', { error: 'Se requiere una imagen del mapa' }),
      403: r('Sin acceso al museo', { error: 'No tienes acceso a este museo' }),
    },
  },
  'POST /maps/{map_id}/zones': {
    summary: 'Crear una zona de interés',
    description: 'Crea un punto de interés en el mapa. `category` puede ser `exhibit`, `entrance`, `exit`, `base`, etc. Las coordenadas `map_x`/`map_y` están en metros del mundo ROS. Solo puede existir un punto `base` por mapa.',
    requestBody: jsonBody(
      {
        name: { type: 'string' },
        description: { type: 'string' },
        category: { type: 'string', description: 'exhibit | entrance | exit | base ...' },
        map_x: { type: 'number', description: 'Coordenada X en metros (ROS)' },
        map_y: { type: 'number', description: 'Coordenada Y en metros (ROS)' },
      },
      ['name'],
      { name: 'Sala del Renacimiento', description: 'Pintura de los siglos XV-XVI', category: 'exhibit', map_x: 3.2, map_y: 1.8 }
    ),
    responses: {
      201: r('Zona creada', { id: 'z-12', map_id: 'map-1', name: 'Sala del Renacimiento', description: 'Pintura de los siglos XV-XVI', category: 'exhibit', map_x: 3.2, map_y: 1.8 }),
      400: r('Datos inválidos', { error: 'El nombre es obligatorio' }),
      409: r('Ya existe un punto base', { error: 'Este mapa ya tiene un punto base. Edítalo para moverlo.' }),
    },
  },
};

function tagFor(routePath) {
  for (const [re, tag] of TAG_RULES) if (re.test(routePath)) return tag;
  return 'General';
}
function isPublic(method, routePath) {
  return PUBLIC.some(([m, p]) => m === method && p === routePath);
}

// Convierte `/robots/:id/command` -> `/robots/{id}/command`
function toOpenApiPath(p) {
  return p.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}
// Extrae los nombres de parámetros de ruta de `/robots/{id}/zones/{zid}`
function pathParams(openApiPath) {
  return [...openApiPath.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(m => m[1]);
}

// -- Descubrimiento de rutas en routes/api.js --
function discoverRoutes() {
  const src = fs.readFileSync(ROUTES_FILE, 'utf8');
  // router.get('/path'  |  router.post("/path"  |  router.patch(`/path`
  const re = /router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;
  const found = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    const method = m[1].toLowerCase();
    const routePath = toOpenApiPath(m[2]);
    const key = method + ' ' + routePath;
    if (seen.has(key)) continue;       // evita duplicados (rutas repetidas)
    seen.add(key);
    found.push({ method, routePath });
  }
  return found;
}

function buildOperation(method, routePath) {
  const secured = !isPublic(method, routePath);
  const params = pathParams(routePath).map(name => ({
    name, in: 'path', required: true, schema: { type: 'string' },
  }));
  const responses = {
    200: { description: 'Operación correcta' },
  };
  if (secured) {
    responses[401] = {
      description: 'No autenticado o token inválido',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    };
    responses[403] = {
      description: 'Sin permisos suficientes para esta operación',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    };
  }
  responses.default = {
    description: 'Error',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
  };
  const op = {
    tags: [tagFor(routePath)],
    summary: `${VERB[method] || method.toUpperCase()} ${routePath}`,
    security: secured ? [{ bearerAuth: [] }] : [],
    responses,
  };
  if (params.length) op.parameters = params;

  // Enriquecimiento manual (descripción, cuerpo y respuestas con ejemplos)
  const extra = ENRICH[`${method.toUpperCase()} ${routePath}`];
  if (extra) {
    if (extra.summary) op.summary = extra.summary;
    if (extra.description) op.description = extra.description;
    if (extra.requestBody) op.requestBody = extra.requestBody;
    if (extra.responses) {
      delete op.responses['200'];   // el enriquecimiento define el código de éxito real (200/201)
      op.responses = Object.assign({}, op.responses, extra.responses);
    }
  }
  return op;
}

function buildSpec() {
  const routes = discoverRoutes();
  const paths = {};
  for (const { method, routePath } of routes) {
    paths[routePath] = paths[routePath] || {};
    paths[routePath][method] = buildOperation(method, routePath);
  }

  return {
    openapi: '3.0.0',
    info: {
      title: 'API de ARTEC',
      version: '1.0.0',
      description:
        'API REST de la plataforma ARTEC: gestión de museos, robots, mapas, zonas, ' +
        'personal, visitantes, conversaciones con IA e incidencias. La mayoría de ' +
        'endpoints requieren un token JWT en la cabecera `Authorization: Bearer <token>`.',
    },
    servers: [{ url: 'http://localhost:3000', description: 'Entorno de desarrollo' }],
    tags: [
      { name: 'Autenticación', description: 'Login, sesiones de visitante y contraseñas' },
      { name: 'Visitante / Chat', description: 'Interacción del visitante con el robot y la IA' },
      { name: 'Robots', description: 'Listado, control, navegación y telemetría de robots' },
      { name: 'Museos y Mapas', description: 'Gestión de museos, mapas y zonas de interés' },
      { name: 'Administración', description: 'Gestión de personal y estadísticas' },
      { name: 'Historial', description: 'Historial de conversaciones visitante-robot' },
      { name: 'Incidencias', description: 'Incidencias operativas de la flota' },
      { name: 'General', description: 'Otros endpoints' },
    ],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Museum: {
          type: 'object',
          properties: {
            id: { type: 'string' }, name: { type: 'string' },
            company: { type: 'string' }, created_at: { type: 'string' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' },
            role: { type: 'string', enum: ['platform_admin', 'museum_admin', 'technician'] },
            active: { type: 'integer' }, must_change_password: { type: 'integer' },
            avatar: { type: 'string' }, museum_id: { type: 'string' }, created_at: { type: 'string' },
          },
        },
        Robot: {
          type: 'object',
          properties: {
            id: { type: 'string' }, museum_id: { type: 'string' }, map_id: { type: 'string' },
            name: { type: 'string' },
            status: { type: 'string', enum: ['idle', 'moving', 'charging', 'navigating'] },
            battery: { type: 'integer' }, position_x: { type: 'number' },
            position_y: { type: 'number' }, position_theta: { type: 'number' },
            ip: { type: 'string' }, locked_until: { type: 'string' }, current_visitor_id: { type: 'string' },
          },
        },
        Map: {
          type: 'object',
          properties: {
            id: { type: 'string' }, museum_id: { type: 'string' }, name: { type: 'string' },
            image_path: { type: 'string' }, resolution: { type: 'number' },
            origin_x: { type: 'number' }, origin_y: { type: 'number' }, origin_theta: { type: 'number' },
            width: { type: 'integer' }, height: { type: 'integer' },
          },
        },
        Zone: {
          type: 'object',
          properties: {
            id: { type: 'string' }, map_id: { type: 'string' }, name: { type: 'string' },
            description: { type: 'string' }, category: { type: 'string' },
            map_x: { type: 'number' }, map_y: { type: 'number' },
          },
        },
        Visitor: {
          type: 'object',
          properties: {
            id: { type: 'string' }, session_id: { type: 'string' }, robot_id: { type: 'string' },
            name: { type: 'string' }, expertise_level: { type: 'string' },
            language: { type: 'string' }, created_at: { type: 'string' }, ended_at: { type: 'string' },
          },
        },
        ChatMessage: {
          type: 'object',
          properties: {
            id: { type: 'string' }, visitor_id: { type: 'string' }, session_id: { type: 'string' },
            robot_id: { type: 'string' }, role: { type: 'string', enum: ['user', 'assistant'] },
            content: { type: 'string' }, intent: { type: 'string' }, created_at: { type: 'string' },
          },
        },
        Incident: {
          type: 'object',
          properties: {
            id: { type: 'string' }, museum_id: { type: 'string' }, robot_id: { type: 'string' },
            visitor_id: { type: 'string' }, type: { type: 'string' }, place_name: { type: 'string' },
            detail: { type: 'string' }, resolved: { type: 'integer' }, created_at: { type: 'string' },
          },
        },
        Error: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
      },
    },
  };
}

// -- Generación --
const spec = buildSpec();
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(spec, null, 2));
const ops = Object.values(spec.paths).reduce((n, m) => n + Object.keys(m).length, 0);
const enriched = Object.keys(ENRICH).length;
console.log(`[swagger] Especificación OpenAPI generada: ${Object.keys(spec.paths).length} rutas, ${ops} operaciones (${enriched} enriquecidas a mano)`);
console.log(`[swagger] Escrito en ${OUTPUT_FILE}`);
