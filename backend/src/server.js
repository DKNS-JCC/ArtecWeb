const path = require('path');
const dotenv = require('dotenv');

// Cargar variables de entorno desde la raíz del proyecto (debe ir antes de cualquier otro require)
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

const ratelimit = require('express-rate-limit');
const limiter = ratelimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limitar a 100 solicitudes por IP por ventana
  message: { error: 'Demasiadas solicitudes, por favor intente nuevamente más tarde.' }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(limiter);


// Servir la carpeta uploads estáticamente
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Main welcome route for backend root
app.get('/', (req, res) => {
  res.json({ message: 'API activa!!!!!!!!!' });
});

// API Routes
app.use('/api', apiRoutes);

// Manejo de errores 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start Server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Preparen sus roombas que el backend esta on fire`);
});
