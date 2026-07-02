# Informe de refactor profundo — ArtecWeb2

> Rama: `limpieza-final`. Refactor que preserva comportamiento (tests del backend en verde). Un commit por unidad salvo la Fase A inicial, consolidada por decisión del autor.

## Fase A · Backend estructural (protegido por Jest)

| Unidad | Estado | Líneas antes→después | Notas |
|--------|--------|----------------------|-------|
| A2 · Helpers de BD en `utils/db.js` | HECHO | — | Ya aplicado en la limpieza (commit `d011a9a`). |
| A3 · Extraer estadísticas de `/admin/stats` | HECHO | ~18 SQL inline → `services/statsService.js` | Colapsa cada par global/acotado en una consulta con `(? OR museum_id = ?)`. |
| Dedup · `utils/access.js` (`museumScope`, `loadRobotForUser`) | HECHO | — | Centraliza el patrón multi-museo repetido en `api.js`, `authController`, `chatHistoryController`, `incidentService`. |
| A7 · Deduplicar borrado de avatar | HECHO | — | Ya aplicado en la limpieza (commit `54fecb7`). |
| A1 · Consolidar `require()` inline en `api.js` | HECHO | — | jwt y crypto subidos a cabecera; visitorMiddleware inline (x3) eliminado. |
| A6 · Helper de token SSE | HECHO | — | `middleware/sseAuth.js` (`verifySseToken`); cada stream conserva su chequeo de rol. |
| A5 · Extraer `visitorController` | HECHO | — | confirm-nav, expertise y visitor/map → `controllers/visitorController.js`; visitorMiddleware como middleware normal. |
| A4 · Extraer `robotController` | HECHO | `api.js` 611→203 | 13 handlers movidos a `controllers/robotController.js`. DTO robot: los 2 objetos (lista/detalle) no son idénticos, se dejan en el controller; merge con `sseService.formatRobot` NO hecho (opcional, mayor riesgo). |

Verificación de la Fase A: `cd backend && npm test` → 121/121 en verde. `api.js` reducido a enrutado fino (611 → 203 líneas).
