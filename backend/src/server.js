const path = require('path');
const dotenv = require('dotenv');

// Cargar variables de entorno desde la raíz del proyecto (debe ir antes de cualquier otro require)
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

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
app.listen(PORT, () => {
  console.log(`API running`);
});
