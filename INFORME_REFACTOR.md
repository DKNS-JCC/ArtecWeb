# Informe de refactor profundo — ArtecWeb2

> Rama: `limpieza-final`. Refactor que preserva comportamiento (tests del backend en verde). Un commit por unidad salvo la Fase A inicial, consolidada por decisión del autor.

## Fase A · Backend estructural (protegido por Jest)

| Unidad | Estado | Líneas antes→después | Notas |
|--------|--------|----------------------|-------|
| A2 · Helpers de BD en `utils/db.js` | HECHO | — | Ya aplicado en la limpieza (commit `d011a9a`). |
| A3 · Extraer estadísticas de `/admin/stats` | HECHO | ~18 SQL inline → `services/statsService.js` | Colapsa cada par global/acotado en una consulta con `(? OR museum_id = ?)`. |
| Dedup · `utils/access.js` (`museumScope`, `loadRobotForUser`) | HECHO | — | Centraliza el patrón multi-museo repetido en `api.js`, `authController`, `chatHistoryController`, `incidentService`. |
| A7 · Deduplicar borrado de avatar | HECHO | — | Ya aplicado en la limpieza (commit `54fecb7`). |
| A1 · Consolidar `require()` inline en `api.js` | PENDIENTE | — | jsonwebtoken (x2 SSE), visitorMiddleware (x3), crypto (x1). |
| A4 · Extraer `robotController` | PENDIENTE | — | Handlers de robots aún inline en `api.js`. DTO de robot parcialmente deduplicado vía `access.js`. |
| A5 · Extraer `visitorController` | PENDIENTE | — | `POST /chat/confirm-nav`, `PATCH /visitor/expertise`, `GET /visitor/map`. |
| A6 · Helper de token SSE | PENDIENTE | — | JWT inline duplicado en `/robots/stream` y `/robots/position-stream`. |

Verificación de la Fase A hasta ahora: `cd backend && npm test` → 121/121 en verde.
