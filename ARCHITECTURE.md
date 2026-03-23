# ArtecWeb2 — Architecture Reference (MVVM)

DEVELOPED IN WINDOWS

## 1. Project Overview

ArtecWeb2 is a full-stack web platform enabling museum visitors to interact with robots via QR code scanning, while providing administrative dashboards for museum and platform admins to manage robots, staff, and statistics.

- **Frontend:** Vue 3 SPA (Composition API + Pinia)
- **Backend:** Node.js + Express REST API
- **Database:** SQLite
- **Robot Control:** ROS via WebSockets (roslibjs)

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend framework | Vue 3 (Composition API, `<script setup>`) |
| Build tool | Vite 7.3.1 |
| State management | Pinia 3.0.4 |
| Routing | Vue Router 5.0.3 |
| Styling | Tailwind CSS v4 + shadcn-style UI components |
| Icons | lucide-vue-next |
| Utilities | @vueuse/core |
| Backend runtime | Node.js |
| Backend framework | Express 5.2.1 |
| Database | SQLite 6.0.1 |
| Auth | JWT (jsonwebtoken) + bcrypt |
| File upload | multer |
| Email | nodemailer |
| Robot comms | roslib 2.1.0 |

---

## 3. Directory Structure

```
ArtecWeb2/
├── frontend/
│   └── src/
│       ├── views/           # VIEW — page-level components
│       ├── components/      # VIEW — reusable UI components
│       │   └── ui/          #   Button, Card, Input, Label, Alert
│       ├── stores/          # VIEWMODEL — Pinia stores
│       ├── services/        # SERVICE — API client abstraction
│       ├── router/          # Vue Router config + guards
│       ├── composables/     # Reusable logic hooks
│       ├── lib/             # Utility functions
│       └── main.js          # App entry point
├── backend/
│   └── src/
│       ├── server.js        # Express app setup + static serving
│       ├── database.js      # SQLite schema + initialization
│       ├── routes/api.js    # All route definitions
│       ├── controllers/     # Request handlers
│       ├── middleware/      # Auth + role middlewares
│       ├── services/        # Business logic (ROS, etc.)
│       ├── config/          # multer upload config
│       └── utils/           # emailService.js, helpers
├── database/
│   └── database.sqlite
└── ARCHITECTURE.md
```

---

## 4. MVVM Layers

### MODEL — Data & Persistence

**Backend (source of truth):**
- SQLite database at `database/database.sqlite`
- Schema managed in `backend/src/database.js`

**Frontend (derived):**
- API response shapes used as implicit models throughout components and stores

### VIEW — UI & Presentation

All `.vue` SFCs. Templates handle rendering; `<script setup>` handles DOM events only.

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `HomeView.vue` | Landing page |
| `/login` | `LoginView.vue` | Staff/admin auth |
| `/dashboard` | `DashboardView.vue` | Admin control panel |
| `/profile` | `ProfileView.vue` | User profile + avatar |
| `/chat` | `ChatView.vue` | Visitor ↔ robot interaction |
| `/r/:id` | `ScanView.vue` | QR code entry point |
| `/change-password` | `ChangePasswordView.vue` | Forced password reset |
| `/403` | `ForbiddenView.vue` | Access denied |
| `/404` | `NotFoundView.vue` | Not found |

### VIEWMODEL — State & Logic

**Pinia store: `useAuthStore`** (`frontend/src/stores/auth.js`)

```
State
  token          — JWT string
  user           — { id, name, email, role, museum_id, avatar, must_change_password }

Computed
  isAuthenticated
  isMuseumAdmin    (museum_admin OR platform_admin)
  isPlatformAdmin
  isVisitor
  mustChangePassword

Actions
  login(identifier, password)
  createVisitor(robotId, name)
  changePassword(current, new)
  uploadAvatar(formData)
  logout()
  initFromStorage()   — hydrate from localStorage on app init
  persist(token, user)

Persistence
  localStorage keys: artec_token, artec_user
```

> Components use `ref()` / `reactive()` for local UI state (form inputs, loading flags, modals). This is NOT stored in Pinia.

### SERVICE LAYER — API Abstraction

Sits between ViewModels and the network. All files in `frontend/src/services/`.

| File | Responsibility |
|------|---------------|
| `api.js` | Base fetch wrapper — injects `Authorization: Bearer` header, handles 401 → auto-logout + redirect |
| `authService.js` | Auth endpoints (login, visitor, password, avatar) |
| `robotService.js` | Robot CRUD + command endpoints |
| `museumService.js` | Museum CRUD endpoints |

---

## 5. Data Flow

```
User Action (View template event)
  ↓
Component handler (<script setup>)
  ↓
Store action (ViewModel) or direct service call
  ↓
Service file (api.js + domain service)
  ↓
Express route → authMiddleware → adminMiddleware → controller → SQLite
  ↓
JSON response
  ↓
Store state update → computed recompute
  ↓
Reactive re-render (View)
```

**Example — Login:**
1. User submits `LoginView` form
2. `handleLogin()` calls `authStore.login(identifier, password)`
3. Auth store calls `authService.login()` → `POST /api/auth/login`
4. Backend validates with bcrypt, returns `{ token, user }`
5. Store calls `persist(token, user)` → updates state + localStorage
6. `isAuthenticated` computed becomes `true`
7. Router guard reads role, redirects to `/dashboard`

**Example — Fetch Robots:**
1. `DashboardView` mounted → calls `robotService.fetchAll()`
2. `api.js` adds Bearer token → `GET /api/robots`
3. `authMiddleware` validates JWT; `adminMiddleware` checks role
4. Controller queries SQLite, merges ROS connection states
5. Returns robot array → stored in component-local `robots.value`
6. Template re-renders robot cards reactively

---

## 6. Backend Request Pipeline

```
Express Request
  → Router (routes/api.js)
  → authMiddleware         (verify JWT, attach req.user)
  → adminMiddleware        (role check: museum_admin | platform_admin)
  → superAdminMiddleware   (role check: platform_admin only)
  → Controller function    (query DB, return JSON)
```

### Middleware

| Middleware | File | Check |
|-----------|------|-------|
| `authMiddleware` | `middleware/authMiddleware.js` | Valid JWT required |
| `adminMiddleware` | same | role in `['museum_admin','platform_admin']` |
| `superAdminMiddleware` | same | role === `'platform_admin'` |

### Controllers

| Controller | File | Key Functions |
|-----------|------|--------------|
| Auth | `controllers/authController.js` | `login`, `createVisitor`, `pingVisitor`, `endVisitor`, `createStaff`, `listUsers`, `changePassword`, `uploadAvatar`, `deleteAvatar` |
| Museum | `controllers/museumController.js` | `createMuseum`, `listMuseums` |
| Robot | (inline in routes) | CRUD + `sendCommand` |

---

## 7. API Routes Summary

```
# Public
POST   /api/auth/visitor              Create visitor session (locks robot)
POST   /api/auth/login                Staff/admin login

# Authenticated (any role)
POST   /api/auth/visitor/ping         Extend visitor session
POST   /api/auth/visitor/end          End session + unlock robot
POST   /api/auth/change-password
POST   /api/auth/avatar               Upload avatar (multipart)
DELETE /api/auth/avatar

# Admin (museum_admin | platform_admin)
POST   /api/admin/create-staff        Create staff, sends welcome email
GET    /api/admin/users               List users
GET    /api/admin/stats               Dashboard statistics
GET    /api/robots                    List robots
GET    /api/robots/:id
PUT    /api/robots/:id
POST   /api/robots/:id/command        Send ROS command

# Superadmin (platform_admin only)
POST   /api/museums
GET    /api/museums
POST   /api/robots                    Create robot
```

---

## 8. Role-Based Access Control

| Role | Description | Access Scope |
|------|-------------|-------------|
| `platform_admin` | Platform superadmin | All museums, robots, users |
| `museum_admin` | Museum administrator | Own museum only |
| `technician` | Technical staff | View robots; limited commands |
| `visitor` | Temporary QR session | Chat + robot interaction |

**Frontend enforcement:** `router/index.js` `beforeEach` guard reads `meta.requiresAdmin` / `meta.requiresStaff` flags and redirects to `/403` if role insufficient.

**Backend enforcement:** Route-level middleware chains (`authMiddleware`, `adminMiddleware`, `superAdminMiddleware`).

---

## 9. Authentication

### Staff Login (JWT 24h)
```
POST /api/auth/login { identifier, password }
→ bcrypt.compare → jwt.sign({ id, name, role, museum_id, must_change_password }, JWT_SECRET, '24h')
→ { token, user }
```

### Visitor Session (JWT 12h)
```
POST /api/auth/visitor { robotId, name }
→ robots row: locked_until = now+12h, current_visitor_id = visitorId
→ jwt.sign({ id, session_id, role:'visitor', robot_id, museum_id, name }, JWT_SECRET, '12h')
```

Token stored in localStorage (`artec_token`). Injected as `Authorization: Bearer` on every request by `api.js`.

---

## 10. Database Schema

### museums
```sql
id TEXT PRIMARY KEY,  name TEXT NOT NULL,  company TEXT NOT NULL,  created_at DATETIME
```

### users
```sql
id TEXT,  name TEXT,  email TEXT UNIQUE,  password_hash TEXT,
role TEXT CHECK('platform_admin'|'museum_admin'|'technician'),
must_change_password INTEGER DEFAULT 0,  avatar TEXT,
museum_id TEXT → museums,  created_by TEXT → users,  active INTEGER DEFAULT 1,  created_at DATETIME
```

### robots
```sql
id TEXT,  name TEXT,  museum_id TEXT → museums,
status TEXT CHECK('idle'|'moving'|'charging'),  battery INTEGER,
position_x REAL,  position_y REAL,  position_theta REAL,  last_update DATETIME,
locked_until DATETIME,  current_visitor_id TEXT → visitors
```

### visitors
```sql
id TEXT,  session_id TEXT UNIQUE,  robot_id TEXT → robots,
name TEXT,  created_at DATETIME,  ended_at DATETIME
```

---

## 11. ROS Integration

**File:** `backend/src/services/rosService.js`

Manages per-robot WebSocket connections to physical TurtleBot units.

```
connect(robotId, ip, port)       → open roslib.Ros connection
disconnect(robotId)              → close connection
getConnectionState(robotId)      → boolean
initTurtlebotTopics(robotId)     → subscribe to:
    /commands/velocity  (Twist)  — send movement
    /diagnostics        (DiagnosticArray) — battery
    /odom               (Odometry)        — position
    /scan               (LaserScan)       — LIDAR
move(robotId, linearX, angularZ) → publish Twist message
```

**API endpoint:** `POST /api/robots/:id/command`
```json
{ "command": "connect|disconnect|move|stop|charge", "payload": { "linearX": 0.5, "angularZ": 0.0 } }
```

---

## 12. File Upload (Avatars)

- **Client:** `authService.uploadAvatar(formData)` — `multipart/form-data`
- **Server config:** `backend/src/config/uploadConfig.js` (multer)
- **Storage:** `backend/uploads/avatars/`
- **Served at:** `GET /uploads/avatars/:filename` (Express static)
- **DB field:** `users.avatar` stores relative path

---

## 13. Environment Config

| Variable | Default | Where |
|----------|---------|-------|
| `VITE_API_URL` | `http://localhost:3000/api` | frontend `.env` |
| `PORT` | `3000` | backend |
| `JWT_SECRET` | `super-secret-artec-key` | backend |

---

## 14. Key Files Quick Reference

| Purpose | Path |
|---------|------|
| App entry | `frontend/src/main.js` |
| Root component | `frontend/src/App.vue` |
| Router + guards | `frontend/src/router/index.js` |
| Auth ViewModel | `frontend/src/stores/auth.js` |
| HTTP client | `frontend/src/services/api.js` |
| Auth service | `frontend/src/services/authService.js` |
| Robot service | `frontend/src/services/robotService.js` |
| Museum service | `frontend/src/services/museumService.js` |
| Express app | `backend/src/server.js` |
| DB schema | `backend/src/database.js` |
| All routes | `backend/src/routes/api.js` |
| Auth middleware | `backend/src/middleware/authMiddleware.js` |
| Auth controller | `backend/src/controllers/authController.js` |
| Museum controller | `backend/src/controllers/museumController.js` |
| ROS service | `backend/src/services/rosService.js` |
| Email utils | `backend/src/utils/emailService.js` |
| Upload config | `backend/src/config/uploadConfig.js` |
