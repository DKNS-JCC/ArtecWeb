const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const apiRoutes = require('./routes/api');

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

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
