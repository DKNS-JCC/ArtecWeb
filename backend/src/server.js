const path = require('path');
const dotenv = require('dotenv');

// Cargar variables de entorno desde la raíz del proyecto (debe ir antes de cualquier otro require)
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const cleanupService = require('./services/cleanupService');

const app = express();
const PORT = process.env.PORT || 3000;

const ratelimit = require('express-rate-limit');
const limiter = ratelimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limitar a 100 solicitudes por IP por ventana
  message: { error: 'Demasiadas solicitudes, por favor intente nuevamente más tarde.' },
  skip: (req) => req.path.includes('/api/robots') || req.path.includes('/api/docs'),
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(limiter);

// Servir la carpeta uploads estáticamente
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Ruta principal de bienvenida en la raíz del backend
app.get('/', (req, res) => {
  res.json({ message: 'API activa' });
});

// Rutas de la API
app.use('/api', apiRoutes);

// -- Documentación interactiva de la API (Swagger UI) --
// Servimos los assets de Swagger UI por ruta ABSOLUTA (/api/docs/...) y una página
// HTML propia con URLs absolutas. Así funciona igual accediendo directo al backend
// o a través del proxy de Vite, y con o sin barra final, evitando los redirects y
// las rutas relativas de swagger-ui-express que rompían la carga de los assets.
// Carga protegida: si el spec o los assets no están disponibles, la API sigue
// funcionando con normalidad y solo se omite la documentación.
try {
  const swaggerSpec = require('./docs/swagger-output.json');
  const swaggerAssets = require('swagger-ui-dist').absolutePath();
  const swaggerHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>API de ARTEC - Documentación</title>
  <link rel="stylesheet" href="/api/docs/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/api/docs/swagger-ui-bundle.js"></script>
  <script src="/api/docs/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api/docs.json',
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: 'StandaloneLayout',
        persistAuthorization: true,
      });
    };
  </script>
</body>
</html>`;
  app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));
  app.get(['/api/docs', '/api/docs/'], (req, res) => res.type('html').send(swaggerHtml));
  app.use('/api/docs', express.static(swaggerAssets, { index: false }));
} catch (err) {
  console.warn('[docs] Swagger UI no disponible:', err.message,
    '\n        Ejecuta "npm install" y "npm run docs:api" para habilitar /api/docs.');
}

// Manejo de errores 404
app.use((req, res) => {
  res.status(404).json({ error: 'No encontrado' });
});

// Arranca el servidor (se omite en modo test - supertest gestiona el binding)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor en el puerto ${PORT}`);
  });
  cleanupService.start();
}

module.exports = app;
