# CONTEXTO COMPLETO DEL PROYECTO ARTEC — Plan de Negocio y Documentación Técnica

> **Propósito de este documento:** Poner al día a cualquier IA o persona sobre el proyecto ARTEC de forma integral, cubriendo tanto el contexto de negocio (programa TCUE / plan de empresa) como la implementación técnica completa de la plataforma software.

---

## 1. VISIÓN GENERAL DEL PROYECTO

**ARTEC** es una plataforma integral de robótica de servicio diseñada para revolucionar la experiencia del visitante en museos y espacios culturales. Combina un **robot móvil autónomo** (basado en TurtleBot/Kobuki) con una **plataforma web de gestión centralizada** y un **sistema de interacción por inteligencia artificial** (Gemini de Google).

**Promotor:** Jorge Cuadrado Criado — estudiante de Ingeniería Informática (Universidad de Salamanca).

**Programa:** TCUE (Transferencia de Conocimiento Universidad-Empresa) de Castilla y León.

---

## 2. CONTEXTO DE NEGOCIO (TCUE)

### 2.1 Problema Identificado

Los museos y espacios culturales se enfrentan a un desfase tecnológico creciente:

- **Sistemas de guiado obsoletos:** Folletos, audioguías convencionales y carteles ofrecen una experiencia estática, unidireccional y poco interactiva.
- **Barreras de accesibilidad:** Las soluciones actuales excluyen a personas con discapacidades visuales, cognitivas o de otro tipo.
- **Dependencia de guías humanos:** Muchos espacios (ermitas, museos rurales, centros de interpretación) no pueden asumir el coste de personal constante.
- **Público digitalizado insatisfecho:** Las nuevas generaciones esperan experiencias inmersivas e interactivas que los sistemas tradicionales no proporcionan.

### 2.2 Propuesta de Valor

ARTEC ofrece un **ecosistema completo**, no solo un robot:

| Componente | Descripción |
|---|---|
| **Producto físico** | Plataforma robótica móvil autónoma con interacción multimodal (voz + app) y sistema web centralizado |
| **Servicio de implantación** | Digitalización del espacio (mapeo), configuración de itinerarios y formación del personal |
| **Mantenimiento y actualizaciones** | Soporte técnico continuo de hardware y software |
| **Modelo SaaS ("Robot como Servicio")** | Cuota mensual/anual que incluye alquiler del robot, licencia de software y mantenimiento integral |

**Ventajas competitivas clave:**

1. **Autogestión total:** El personal del museo puede modificar planos, añadir puntos de interés y crear rutas en tiempo real desde la plataforma web, sin conocimientos técnicos ni coste adicional.
2. **Accesibilidad e inclusión reales:** Interacción natural mediante voz adaptada al nivel del visitante (niño, general, estudiante, experto) y navegación autónoma física.
3. **Optimización de recursos:** Automatiza tareas repetitivas de orientación, liberando al personal humano para labores de mayor valor.

### 2.3 Modelo de Negocio (B2B)

El modelo es **Business-to-Business**. Los clientes no son los visitantes, sino las **entidades gestoras** de espacios culturales:

| Segmento de cliente | Ejemplos | Motivación de compra |
|---|---|---|
| Museos y galerías de arte | Museos nacionales, municipales, privados | Modernizar la experiencia, atraer público joven |
| Fundaciones culturales | CaixaForum, Fundación Telefónica | Innovación y renovación periódica de exposiciones |
| Instituciones públicas | Ayuntamientos, Diputaciones, Consejerías de Cultura | Inversión en innovación turística y accesibilidad |

**Mercado geográfico:** Sector cultural y turístico español, con capacidad de escalado europeo.

### 2.4 Estrategia Comercial

- Contacto directo con instituciones culturales
- Presencia en ferias tecnológicas y culturales
- Página web corporativa con demos del sistema
- Colaboraciones con entidades del sector cultural/tecnológico

### 2.5 Modelos de Ingreso

| Modelo | Descripción |
|---|---|
| **Venta directa** | Compra del robot + licencia perpetua del software + contrato de mantenimiento |
| **Robot como Servicio (RaaS)** | Cuota mensual/anual todo incluido (alquiler + software + soporte) |
| **Implantación** | Servicio único de mapeo, configuración y formación |
| **Mantenimiento premium** | Planes de soporte ampliado con SLA |

---

## 3. ARQUITECTURA TÉCNICA

### 3.1 Stack Tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| **Frontend Framework** | Vue 3 (Composition API, `<script setup>`) | 3.5.25 |
| **Build Tool** | Vite | 7.3.1 |
| **Estado global** | Pinia | 3.0.4 |
| **Routing** | Vue Router | 5.0.3 |
| **Styling** | Tailwind CSS v4 + componentes shadcn-style | 4.2.1 |
| **Iconos** | lucide-vue-next | 0.577.0 |
| **Backend Runtime** | Node.js + Express | 5.2.1 |
| **Base de datos** | SQLite | 6.0.1 |
| **Autenticación** | JWT (jsonwebtoken) + bcrypt | — |
| **IA conversacional** | Google Gemini API (gemini-2.5-flash) | — |
| **Comunicación robótica** | roslib (WebSocket → ROS/rosbridge) | 2.1.0 |
| **Email** | Nodemailer (Gmail SMTP) | 8.0.2 |
| **Procesamiento de imágenes** | Sharp | 0.34.5 |
| **Subida de archivos** | Multer | 2.1.1 |
| **Rate limiting** | express-rate-limit | 8.3.1 |
| **Testing** | Jest + Supertest | — |

### 3.2 Estructura del Proyecto

```
ArtecWeb2/
├── frontend/                          # SPA Vue 3
│   └── src/
│       ├── views/                     # Páginas completas (11 vistas)
│       │   ├── HomeView.vue           # Landing page pública
│       │   ├── LoginView.vue          # Login staff/admin
│       │   ├── DashboardView.vue      # Panel de administración (54KB, muy completo)
│       │   ├── ChatView.vue           # Interfaz visitante ↔ robot (27KB)
│       │   ├── ScanView.vue           # Punto de entrada QR (/r/:id)
│       │   ├── ProfileView.vue        # Perfil de usuario + avatar
│       │   ├── ChangePasswordView.vue # Cambio de contraseña obligatorio
│       │   ├── ForgotPasswordView.vue # Solicitar reset de contraseña
│       │   ├── ResetPasswordView.vue  # Ejecutar reset con token
│       │   ├── ForbiddenView.vue      # Error 403
│       │   └── NotFoundView.vue       # Error 404
│       ├── components/                # Componentes reutilizables
│       │   ├── MapTab.vue             # Gestión de mapas del museo (40KB)
│       │   ├── RobotControlPanel.vue  # Control remoto de robots (20KB)
│       │   ├── VisitorMap.vue         # Mapa interactivo para visitantes (17KB)
│       │   ├── ChatHistoryTab.vue     # Historial de conversaciones (14KB)
│       │   └── ui/                    # Componentes UI base (alert, button, card, input, label)
│       ├── stores/auth.js             # Pinia store — autenticación global
│       ├── services/                  # Capa de abstracción API
│       │   ├── api.js                 # Wrapper fetch con Bearer token + auto-logout
│       │   ├── authService.js         # Endpoints de autenticación
│       │   ├── chatService.js         # Chat + navegación + mapa visitante
│       │   ├── mapService.js          # CRUD mapas + zonas + asignación
│       │   ├── robotService.js        # CRUD robots + comandos ROS + sensores
│       │   └── museumService.js       # CRUD museos
│       ├── router/index.js            # Rutas + guards de navegación
│       └── main.js                    # Punto de entrada
├── backend/                           # API REST Node.js + Express
│   └── src/
│       ├── server.js                  # Express app setup + CORS + rate limiting
│       ├── database.js                # Schema SQLite + inicialización (8 tablas)
│       ├── routes/api.js              # Todas las definiciones de rutas (750+ líneas)
│       ├── controllers/
│       │   ├── authController.js      # Login, visitantes, staff CRUD, avatares
│       │   ├── chatController.js      # Procesamiento de mensajes IA + resolución de lugares
│       │   ├── chatHistoryController.js # Historial de sesiones/mensajes para admins
│       │   ├── mapController.js       # CRUD mapas + zonas + parseo PGM/YAML de ROS
│       │   ├── museumController.js    # CRUD museos
│       │   └── passwordResetController.js # Forgot/reset password con tokens
│       ├── middleware/
│       │   ├── authMiddleware.js      # Validación JWT + roles (auth, admin, superAdmin)
│       │   └── visitorMiddleware.js   # Validación de sesión de visitante activa
│       ├── services/
│       │   ├── aiService.js           # Integración Gemini: prompts, validación, fallback
│       │   ├── rosService.js          # Conexiones ROS WebSocket: navegación, sensores, telemetría
│       │   └── sseService.js          # Server-Sent Events para actualizaciones en tiempo real
│       ├── config/
│       │   ├── uploadConfig.js        # Multer config para avatares
│       │   └── mapUploadConfig.js     # Multer config para mapas (PGM, PNG, YAML)
│       ├── utils/
│       │   └── emailService.js        # Nodemailer: emails de bienvenida + reset de contraseña
│       ├── scripts/
│       │   └── seed.js                # Script de seedeo de datos iniciales
│       └── __tests__/                 # Tests Jest (auth, chat, robots, middleware, stats, AI)
├── database/
│   ├── database.sqlite                # BD de producción
│   └── test.sqlite                    # BD de tests
├── .env.example                       # Variables de entorno documentadas
└── ARCHITECTURE.md                    # Documento de arquitectura técnica
```

### 3.3 Esquema de Base de Datos (8 tablas)

```
┌──────────────────┐     ┌──────────────────┐
│     museums       │     │      users       │
├──────────────────┤     ├──────────────────┤
│ id TEXT PK        │◄────│ museum_id TEXT FK │
│ name TEXT         │     │ id TEXT PK       │
│ company TEXT      │     │ name TEXT UNIQUE  │
│ created_at DT     │     │ email TEXT UNIQUE │
└──────────────────┘     │ password_hash    │
         │               │ role (platform_admin│
         │               │  /museum_admin    │
         │               │  /technician)     │
         │               │ must_change_pwd   │
         │               │ avatar TEXT       │
         │               │ active INTEGER    │
         │               │ created_by FK     │
         │               └──────────────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│      maps        │     │     robots       │
├──────────────────┤     ├──────────────────┤
│ id TEXT PK       │◄────│ map_id TEXT FK    │
│ museum_id FK     │     │ id TEXT PK       │
│ name TEXT        │     │ museum_id FK     │
│ image_path TEXT  │     │ name TEXT        │
│ resolution REAL  │     │ status (idle/    │
│ origin_x/y/theta │     │  moving/charging)│
│ width/height INT │     │ battery INTEGER  │
│ uploaded_at DT   │     │ position_x/y/θ   │
└──────────────────┘     │ ip TEXT          │
         │               │ locked_until DT  │
         │               │ current_visitor FK│
         │               └───────┬──────────┘
         │                       │
         ▼                       ▼
┌──────────────────┐     ┌──────────────────┐
│     zones        │     │    visitors      │
├──────────────────┤     ├──────────────────┤
│ id TEXT PK       │     │ id TEXT PK       │
│ map_id TEXT FK   │     │ session_id UNIQUE│
│ name TEXT        │     │ robot_id FK      │
│ description TEXT │     │ name TEXT        │
│ category TEXT    │     │ expertise_level  │
│ map_x/map_y REAL │     │ created_at DT    │
│ created_at DT    │     │ ended_at DT      │
└──────────────────┘     └───────┬──────────┘
                                 │
                                 ▼
                         ┌──────────────────┐
                         │  chat_messages   │
                         ├──────────────────┤
                         │ id TEXT PK       │
                         │ visitor_id FK    │
                         │ session_id TEXT  │
                         │ robot_id FK      │
                         │ role (user/      │
                         │   assistant)     │
                         │ content TEXT     │
                         │ intent TEXT      │
                         │ created_at DT    │
                         └──────────────────┘

                         ┌──────────────────────┐
                         │ password_reset_tokens │
                         ├──────────────────────┤
                         │ id TEXT PK            │
                         │ user_id FK            │
                         │ token_hash TEXT       │
                         │ expires_at DT         │
                         │ used INTEGER          │
                         └──────────────────────┘
```

**Relaciones clave:**
- 1 museo → N mapas → N zonas
- 1 museo → N robots (cada robot tiene 0..1 mapa asignado)
- 1 robot → N visitantes (sesiones históricas, solo 1 activo simultáneamente)
- 1 visitante/sesión → N mensajes de chat

### 3.4 Sistema de Autenticación y Roles

| Rol | Descripción | Acceso | Duración JWT |
|---|---|---|---|
| `platform_admin` | Superadministrador global | Todo: museos, robots, usuarios de cualquier museo | 24h |
| `museum_admin` | Administrador de un museo | Solo su museo: robots, técnicos, mapas, zonas | 24h |
| `technician` | Personal técnico | Vista de robots, comandos limitados | 24h |
| `visitor` | Sesión temporal por QR | Chat + interacción con el robot asignado | 12h |

**Flujo de autenticación:**
- **Staff:** Login con nombre/email + contraseña → JWT 24h → cambio de contraseña obligatorio en primer login
- **Visitante:** Escaneo QR → pantalla ScanView → nombre + nivel de expertise → JWT 12h → robot bloqueado durante la sesión
- **Persistencia:** `localStorage` (keys: `artec_token`, `artec_user`)
- **Seguridad:** bcrypt (10 rounds) para hashing, tokens de reset con SHA-256, expiración 1h

### 3.5 Sistema de Inteligencia Artificial (Chat)

El visitante interactúa con el robot a través de una interfaz de chat alimentada por **Google Gemini (gemini-2.5-flash)**:

**Intenciones reconocidas:**
| Intent | Descripción | Parámetros |
|---|---|---|
| `navigate_to` | El visitante quiere ir a un lugar | `place_name`, `place_id`, `map_x`, `map_y` |
| `explain` | Pide explicación sobre un tema | `topic` |
| `greet` | Saludo | — |
| `farewell` | Despedida | — |
| `none` | Conversación general | — |

**Niveles de expertise (adaptan el lenguaje de la IA):**
| Nivel | Audiencia | Estilo de respuesta |
|---|---|---|
| `nino` | Niños | Frases muy cortas, comparaciones divertidas, emojis, 2-3 frases |
| `general` | Público general | Lenguaje accesible, tono divulgativo, 3-4 frases |
| `estudiante` | Estudiantes de arte | Terminología básica, contexto histórico, 4-6 frases |
| `experto` | Expertos en arte | Terminología técnica especializada, análisis académico, 5-8 frases |

**Seguridad del prompt:**
- Sanitización de entradas (control characters, HTML, JSON braces)
- Detección de inyección de prompt (patrones como "ignora instrucciones", "actúa como", "jailbreak")
- Fallback a interpretación por keywords si Gemini no está disponible
- Validación de response schema (JSON estricto con `responseMimeType: 'application/json'`)

**Flujo de un mensaje:**
1. Visitante envía mensaje → `POST /api/chat/message`
2. Se carga contexto: museum name, robot name, zonas del mapa, historial (últimos 8 mensajes)
3. Se construye system prompt con nivel de expertise y zonas disponibles
4. Se envía a Gemini con schema de respuesta estructurado
5. Se valida la respuesta, se resuelven nombres de zonas a coordenadas reales
6. Si `navigate_to` → frontend muestra modal de confirmación → `POST /api/chat/confirm-nav`
7. Si confirmado → `rosService.sendNavGoal()` envía coordenada Nav2 al robot real

### 3.6 Integración con ROS (Robot Operating System)

El backend mantiene conexiones WebSocket persistentes con cada robot físico mediante **roslib / rosbridge**:

**Topics ROS suscritos/publicados:**
| Topic | Tipo | Dirección | Propósito |
|---|---|---|---|
| `/cmd_vel_smoothed` | `geometry_msgs/Twist` | Publicación | Teleoperación (velocidad lineal + angular) |
| `/mobile_base/sensors/core` | `kobuki_msgs/SensorState` | Suscripción | Batería (cada 5s) |
| `/amcl_pose` | `PoseWithCovarianceStamped` | Suscripción | Posición del robot (cada 2s) |
| `/goal_pose` | `geometry_msgs/PoseStamped` | Publicación | Enviar objetivo de navegación Nav2 |
| `/navigate_to_pose/_action/status` | `action_msgs/GoalStatusArray` | Suscripción | Detectar fin de navegación (éxito/cancelación/abortada) y devolver `status` del robot a `idle` |
| `/initialpose` | `PoseWithCovarianceStamped` | Publicación | Establecer pose inicial AMCL |
| `/scan` | `sensor_msgs/LaserScan` | Suscripción (lazy) | Datos LIDAR (bajo demanda) |
| `/map` | `nav_msgs/OccupancyGrid` | Suscripción (lazy) | Mapa de ocupación (bajo demanda) |

**Eventos emitidos por RosService (EventEmitter):**
- `robot:update` → cambio de batería/posición → SSE broadcast a admins
- `robot:connect` → robot conectado
- `robot:disconnect` → sesiones de visitante terminadas automáticamente

### 3.7 Sistema de Tiempo Real (SSE)

Los administradores reciben actualizaciones en tiempo real de los robots sin polling:

- **Conexión:** `GET /api/robots/stream?token=<JWT>` (EventSource)
- **Eventos:** `robot` (datos actualizados del robot), `ready` (snapshot inicial completo)
- **Heartbeat:** Cada 25s para mantener la conexión viva
- **Filtrado:** Los `museum_admin` solo reciben robots de su museo; `platform_admin` recibe todos
- **Eficiencia:** Reemplaza N×HTTP-poll con 1 conexión persistente por pestaña

### 3.8 Gestión de Mapas y Zonas

El sistema permite subir mapas de robots ROS y definir puntos de interés:

**Subida de mapas:**
- Acepta formatos **PGM** (nativo de ROS `map_saver`) + archivo YAML opcional con metadatos
- Conversión automática PGM → PNG mediante Sharp
- Parseo de YAML para extraer `resolution`, `origin_x`, `origin_y`, `origin_theta`
- Las coordenadas de zonas se almacenan en **metros ROS** (no píxeles)

**Zonas (Puntos de interés):**
- Pertenecen a un mapa (no a un robot directamente)
- Tienen `name`, `description`, `category` y coordenadas `map_x`/`map_y` en metros
- Se usan para: navegación del robot (navigate_to), contexto de la IA, mapa interactivo del visitante

---

## 4. API REST COMPLETA

### 4.1 Rutas Públicas (sin autenticación)
```
POST /api/auth/visitor              → Crear sesión de visitante (escaneo QR)
POST /api/auth/login                → Login staff/admin
POST /api/auth/forgot-password      → Solicitar reset de contraseña
POST /api/auth/reset-password       → Ejecutar reset con token
```

### 4.2 Rutas Autenticadas (cualquier rol)
```
POST /api/auth/visitor/ping         → Extender sesión de visitante (+10 min)
GET  /api/auth/visitor/status       → Verificar si la sesión sigue activa
POST /api/auth/visitor/end          → Terminar sesión + liberar robot
POST /api/auth/change-password      → Cambiar contraseña
POST /api/auth/avatar               → Subir avatar (multipart)
DELETE /api/auth/avatar             → Eliminar avatar
```

### 4.3 Rutas de Visitante
```
POST  /api/chat/message             → Enviar mensaje al robot/IA (rate: 15/min)
POST  /api/chat/confirm-nav         → Confirmar navegación a un lugar
PATCH /api/visitor/expertise        → Cambiar nivel de expertise
GET   /api/visitor/robot-position   → Obtener posición actual del robot
GET   /api/visitor/map              → Obtener mapa y zonas del robot asignado
```

### 4.4 Rutas de Admin (museum_admin + platform_admin)
```
GET  /api/robots/stream             → SSE tiempo real (EventSource)
POST /api/admin/create-staff        → Crear staff (envía email de bienvenida)
GET  /api/admin/users               → Listar usuarios
PATCH /api/admin/users/:id          → Editar usuario
PATCH /api/admin/users/:id/active   → Activar/desactivar usuario
DELETE /api/admin/users/:id         → Eliminar cuenta pendiente
GET  /api/admin/stats               → Estadísticas del dashboard
GET  /api/robots                    → Listar robots (con estado ROS)
GET  /api/robots/:id                → Detalle de robot
PUT  /api/robots/:id                → Actualizar robot (IP, nombre, mapa)
POST /api/robots/:id/command        → Enviar comando (connect/disconnect/move/stop/charge)
POST /api/robots/:id/nav-goal       → Enviar objetivo Nav2
POST /api/robots/:id/cancel-nav     → Cancelar navegación
POST /api/robots/:id/initial-pose   → Establecer pose inicial AMCL
GET  /api/robots/:id/map            → Obtener OccupancyGrid
GET  /api/robots/:id/pose           → Obtener pose AMCL
GET  /api/robots/:id/scan           → Obtener escaneo láser
POST /api/robots/:id/force-end      → Forzar fin de sesión de visitante
```

### 4.5 Rutas Superadmin (solo platform_admin)
```
POST /api/museums                   → Crear museo
GET  /api/museums                   → Listar museos
POST /api/robots                    → Crear robot
```

### 4.6 Rutas de Mapas y Zonas (admin)
```
POST   /api/museums/:museum_id/maps → Subir mapa (multipart: image + yaml)
GET    /api/museums/:museum_id/maps → Listar mapas del museo
GET    /api/maps/:map_id            → Obtener mapa
DELETE /api/maps/:map_id            → Eliminar mapa (desasigna robots, borra zonas)
GET    /api/maps/:map_id/zones      → Listar zonas del mapa
POST   /api/maps/:map_id/zones      → Crear zona
PUT    /api/maps/:map_id/zones/:id  → Actualizar zona
DELETE /api/maps/:map_id/zones/:id  → Eliminar zona
```

### 4.7 Rutas de Historial de Chat (admin)
```
GET /api/chat-history/robots                        → Robots para filtro
GET /api/chat-history/sessions                      → Listar sesiones (paginado)
GET /api/chat-history/sessions/:session_id/messages → Mensajes de una sesión
```

---

## 5. FLUJOS FUNCIONALES PRINCIPALES

### 5.1 Flujo del Visitante (experiencia completa)

```
1. Visitante escanea QR del robot → /r/:id → ScanView.vue
2. Introduce nombre + selecciona nivel de expertise
3. POST /api/auth/visitor → crea sesión, bloquea robot, conecta ROS automáticamente
4. Redirige a /chat → ChatView.vue (con mapa interactivo + chat IA)
5. Visitante escribe mensaje → POST /api/chat/message → Gemini procesa
6. Si intent=navigate_to → modal de confirmación → POST /api/chat/confirm-nav
7. Robot recibe Nav2 goal y se mueve físicamente
8. VisitorMap muestra posición del robot en tiempo real (polling /visitor/robot-position)
9. Sesión se extiende automáticamente cada 10 min (ping)
10. Visitante termina → POST /api/auth/visitor/end → robot liberado
```

### 5.2 Flujo del Administrador

```
1. Admin accede a /login → LoginView.vue
2. JWT 24h → redirige a /dashboard → DashboardView.vue
3. Dashboard con pestañas:
   - Robots: tarjetas con estado en tiempo real (SSE), control remoto, navegación
   - Mapas: subir mapas ROS (PGM+YAML), definir zonas clickeando en el mapa
   - Personal: crear staff (envía email automático con contraseña temporal)
   - Chat History: revisar todas las conversaciones visitante-robot
   - Estadísticas: total robots, visitantes, sesión media, robots activos
4. Control de robots: conectar ROS, teleoperación, enviar Nav2 goals, ver LIDAR/mapa
5. Gestión de mapas: subir, asignar a robots, definir puntos de interés con coordenadas
```

### 5.3 Flujo de Creación de Personal

```
1. Admin crea staff con nombre + email + rol → POST /api/admin/create-staff
2. Backend genera contraseña temporal segura (8 chars hex + 'Aa1!')
3. Se envía email de bienvenida con credenciales via Gmail SMTP
4. Staff accede por primera vez → forced password change
5. Cuenta queda activa tras cambiar contraseña
```

---

## 6. SEGURIDAD IMPLEMENTADA

| Mecanismo | Implementación |
|---|---|
| **Autenticación** | JWT con expiración (24h staff, 12h visitantes) |
| **Hashing** | bcrypt con 10 salt rounds |
| **Rate limiting** | 100 req/15min global + 15 msg/min para chat |
| **RBAC** | 4 roles con middleware encadenados (auth → admin → superAdmin) |
| **Sanitización IA** | Protección contra prompt injection (10+ patrones) |
| **Reset de contraseña** | Token crypto, SHA-256, single-use, 1h expiración |
| **Avatar upload** | Path traversal protection con resolvedDir check |
| **Sesión visitante** | Robot bloqueado con timestamp, verificación de propiedad |
| **CORS** | Habilitado para desarrollo |
| **Email enumeration** | Forgot password siempre retorna 200 |
| **Deactivated accounts** | Bloqueo de login para cuentas desactivadas |

---

## 7. TESTING

El proyecto incluye **6 suites de tests** con Jest + Supertest:

| Suite | Archivo | Cobertura |
|---|---|---|
| Autenticación | `auth.test.js` | Login, visitor session, password change |
| Chat | `chat.test.js` | Message processing, AI fallback, place resolution |
| Robots | `robots.test.js` | CRUD, commands, ROS integration |
| Middleware | `middleware.test.js` | Auth, admin, superadmin, visitor validation |
| Estadísticas | `stats.test.js` | Dashboard stats queries |
| Servicio IA | `aiService.test.js` | Prompt building, sanitization, injection detection |

Ejecución: `npm test` (desde `/backend`)

---

## 8. CONFIGURACIÓN Y DESPLIEGUE

### Variables de Entorno (.env.local)

```bash
# Backend
PORT=3000
JWT_SECRET=<secreto-random>

# Gmail SMTP (emails automáticos)
GMAIL_USER=<tu-email@gmail.com>
GMAIL_APP_PASSWORD=<app-password-16-chars>

# URL del frontend (para links en emails)
APP_URL=http://localhost:5173/login

# IA Gemini
GEMINI_API_KEY=<tu-api-key>
GEMINI_MODEL=gemini-2.5-flash

# Frontend
VITE_API_URL=http://localhost:3000/api
```

### Comandos de Desarrollo

```bash
# Instalar todo
npm run install:all

# Desarrollo (frontend + backend concurrentemente)
npm run dev

# Solo backend
npm run dev:backend     # nodemon en puerto 3000

# Solo frontend
npm run dev:frontend    # Vite en puerto 5173

# Tests
cd backend && npm test

# Build producción
npm run build           # Vite build del frontend

# Seed DB
cd backend && npm run seed
```

---

## 9. ESTADO ACTUAL DEL DESARROLLO

### Funcionalidades Completadas ✅
- [x] Sistema de autenticación completo (staff + visitantes)
- [x] Dashboard de administración con gestión de robots en tiempo real (SSE)
- [x] Chat con IA (Gemini) con 5 intenciones y 4 niveles de expertise
- [x] Sistema de navegación autónoma (Nav2) con confirmación por modal
- [x] Gestión de mapas ROS (subida PGM/YAML, conversión, zonas)
- [x] Mapa interactivo para visitantes con posición del robot
- [x] Control remoto de robots (teleoperación, LIDAR, AMCL)
- [x] Sistema de emails automáticos (bienvenida + reset password)
- [x] Historial de conversaciones para administradores
- [x] Gestión de personal con roles y permisos
- [x] Sistema de avatares de usuario
- [x] Estadísticas del dashboard
- [x] Rate limiting y seguridad
- [x] Tests unitarios del backend

### Componentes del Robot Físico
- Plataforma: TurtleBot 2 (base Kobuki)
- Navegación: Nav2 (AMCL + map_server)
- Sensores: LIDAR, odometría, batería
- Comunicación: rosbridge_websocket (puerto 9090)

---

## 10. DATOS DEL PROMOTOR

| Campo | Valor |
|---|---|
| **Nombre** | Jorge Cuadrado Criado |
| **DNI** | 70924801T |
| **Email** | jorgecuadradojcc@usal.es |
| **Teléfono** | +34 665 14 89 56 |
| **Formación** | Ingeniería Informática (Universidad de Salamanca) |
| **Programa** | TCUE (Transferencia de Conocimiento Universidad-Empresa) |

---

> **Nota final:** Este documento contiene toda la información necesaria para que cualquier IA o persona pueda comprender el proyecto ARTEC en su totalidad, tanto desde la perspectiva de negocio (plan de empresa TCUE) como desde la implementación técnica. Puede usarse como base para generar cualquier sección del plan de negocio: análisis de mercado, plan financiero, plan de marketing, análisis DAFO, plan de operaciones, etc.
