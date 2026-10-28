require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');

const connectDB = require('./src/config/db');
const { swaggerSpec, swaggerUiOptions } = require('./src/config/swagger');
const { notFound, errorHandler } = require('./src/middleware/errorHandler');

// Routes
const authRoutes = require('./src/routes/auth');
const provinceRoutes = require('./src/routes/provinces');
const districtRoutes = require('./src/routes/districts');
const stationRoutes = require('./src/routes/stations');
const userRoutes = require('./src/routes/users');
const vehicleRoutes = require('./src/routes/vehicles');
const driverRoutes = require('./src/routes/drivers');
const locationRoutes = require('./src/routes/locations');
const liveRoutes = require('./src/routes/live');

const app = express();
const PORT = process.env.PORT || 5000;

// ----- Security & infra middleware -----
app.use(
  helmet({
    contentSecurityPolicy: false, // Swagger UI loads inline scripts/styles
  })
);
/**
 * CORS allowlist, driven by CORS_ORIGINS (comma-separated).
 *
 * The SPA calls this API cross-origin from http://localhost:5173 in dev and
 * from whatever host serves the console in production, so some CORS config is
 * required. An allowlist rather than `*` because this is a police system: `*`
 * lets any page on the internet read the API using a signed-in officer's token
 * if that token ever reaches browser-accessible storage.
 *
 * Unset CORS_ORIGINS falls back to `*` so that Swagger UI, curl and the device
 * clients keep working out of the box, with a startup warning.
 */
const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (corsOrigins.length) {
  app.use(
    cors({
      origin: (origin, callback) => {
        // No Origin header at all: curl, Swagger UI's same-origin calls, and the
        // on-vehicle GPS clients. These are not browser cross-origin requests,
        // so there is nothing for CORS to protect and refusing them would only
        // break the device path.
        if (!origin) return callback(null, true);
        if (corsOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
    })
  );
} else if (process.env.NODE_ENV !== 'test') {
  console.warn(
    '[cors] CORS_ORIGINS is not set — allowing every origin. Set it to the ' +
      'console origin (e.g. http://localhost:5173) before deploying.'
  );
  app.use(cors({ origin: '*' }));
} else {
  app.use(cors({ origin: '*' }));
}
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Rate limiting on the API surface
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'RATE_LIMIT',
    message: 'Too many requests — please slow down.',
  },
});
app.use('/api/', apiLimiter);

// ----- Swagger UI as the HOME PAGE -----
app.use('/', swaggerUi.serve);
app.get('/', swaggerUi.setup(swaggerSpec, swaggerUiOptions));

// Raw OpenAPI JSON for tooling
app.get('/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'OK',
    service: 'tuktuk-tracker-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.round(process.uptime()),
  });
});

// ----- API mount -----
const API = '/api/v1';
app.use(`${API}/auth`, authRoutes);
app.use(`${API}/provinces`, provinceRoutes);
app.use(`${API}/districts`, districtRoutes);
app.use(`${API}/stations`, stationRoutes);
app.use(`${API}/users`, userRoutes);
app.use(`${API}/vehicles`, vehicleRoutes);
app.use(`${API}/drivers`, driverRoutes);
app.use(`${API}/locations`, locationRoutes);
app.use(`${API}/live`, liveRoutes);

// 404 + error handler (last)
app.use(notFound);
app.use(errorHandler);

// ----- Boot -----
const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    const banner = `
╔══════════════════════════════════════════════════════════════════
║  🚖  TUK-TUK TRACKER API — Sri Lanka Police                      
╠══════════════════════════════════════════════════════════════════
║  📚  Swagger UI    : http://localhost:${PORT}/                       
║  📄  OpenAPI JSON  : http://localhost:${PORT}/swagger.json                                         
║  🌱  Seed data     : npm run seed                                
╚══════════════════════════════════════════════════════════════════
    `;
    console.log(banner);
  });
};

// Tests import this module for `app` and manage their own in-memory MongoDB
// (tests/setup.js). Booting here would open a second connection with a
// different URI, which Mongoose rejects — taking the whole Jest run down.
if (process.env.NODE_ENV !== 'test') {
  start().catch((err) => {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = app;
