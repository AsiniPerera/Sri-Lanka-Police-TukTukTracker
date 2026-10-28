const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.3',

    info: {
      title: 'Sri Lanka Police - Tuk-Tuk Tracking API',
      version: '1.0.0',
      description: `
## Real-Time Three-Wheeler Tracking System

A secure REST API designed for tracking, monitoring, and managing registered three-wheelers across Sri Lanka.

This system provides:
- Live vehicle tracking
- Driver and vehicle management
- Police station hierarchy control
- GPS location history logging
- Role-based authentication using JWT

Built for Sri Lanka Police operational monitoring and investigation support.
      `,
      contact: {
        name: 'Sri Lanka Police - IT Division',
        email: 'it-division@police.gov.lk',
      },
      license: {
        name: 'Government of Sri Lanka',
      },
    },


    servers: [
      {
    url: 'https://sltuktracker.up.railway.app/',
    description: 'Production (Railway)',
  },
      {
        url: 'http://localhost:5000',
        description: 'Local API Development Server',
      },
    ],

    tags: [
      { name: 'Auth', description: 'Login & token management' },
      { name: 'Provinces', description: 'Province administration (HQ only)' },
      { name: 'Districts', description: 'District administration' },
      { name: 'Police Stations', description: 'Police station management' },
      { name: 'Users', description: 'Police user management' },
      { name: 'Vehicles', description: 'Three-wheeler registration & lookup' },
      { name: 'Drivers', description: 'Driver records' },
      { name: 'Locations', description: 'GPS ping ingestion & history' },
      { name: 'Live Tracking', description: 'Real-time vehicle status' },
      { name: 'System', description: 'Health & meta endpoints' },
    ],

    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Paste JWT token from /auth/login',
        },
      },

      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Resource not found' },
            error: { type: 'string', example: 'NOT_FOUND' },
          },
        },

        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation completed successfully' },
            data: { type: 'object' },
          },
        },

        PaginatedResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            count: { type: 'integer', example: 25 },
            total: { type: 'integer', example: 250 },
            page: { type: 'integer', example: 1 },
            pages: { type: 'integer', example: 10 },
            limit: { type: 'integer', example: 25 },
            data: { type: 'array', items: { type: 'object' } },
          },
        },

        Province: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '6543abcd1234567890abcdef' },
            name: { type: 'string', example: 'Western' },
            code: { type: 'string', example: 'WP' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },

        District: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            province_id: { type: 'string' },
            name: { type: 'string', example: 'Colombo' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },

        PoliceStation: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            district_id: { type: 'string' },
            station_name: { type: 'string', example: 'Colombo Central Police Station' },
            station_code: { type: 'string', example: 'CMB-CTR-01' },
            contact_number: { type: 'string', example: '+94112345678' },
          },
        },

        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            username: { type: 'string', example: 'officer_silva' },
            role: {
              type: 'string',
              enum: ['ADMIN_HQ', 'PROVINCIAL_OFFICER', 'DISTRICT_OFFICER', 'STATION_OFFICER', 'DEVICE_CLIENT'],
            },
            scope_id: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
            last_login: { type: 'string', format: 'date-time', nullable: true },
          },
        },

        Vehicle: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            license_plate: { type: 'string', example: 'WP-CAB-1234' },
            chassis_number: { type: 'string', example: 'CHS123456789' },
            engine_number: { type: 'string', example: 'ENG987654321' },
            owner_name: { type: 'string', example: 'Kamal Perera' },
            owner_nic: { type: 'string', example: '199012345678' },
            station_id: { type: 'string' },
            status: {
              type: 'string',
              enum: ['REGISTERED', 'SUSPENDED', 'WANTED', 'DECOMMISSIONED'],
            },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },

        Driver: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            nic_number: { type: 'string', example: '199012345678' },
            full_name: { type: 'string', example: 'Sunil Fernando' },
            phone_number: { type: 'string', example: '+94771234567' },
            current_vehicle_id: { type: 'string', nullable: true },
            device_id: { type: 'string', example: 'DEV-A1B2C3D4' },
          },
        },

        LocationPing: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            vehicle_id: { type: 'string' },
            latitude: { type: 'number', format: 'double', example: 6.927079 },
            longitude: { type: 'number', format: 'double', example: 79.861244 },
            speed: { type: 'number', format: 'float', example: 35.5, description: 'km/h' },
            heading: { type: 'number', format: 'float', example: 180, description: 'degrees 0-359' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },

        LiveStatus: {
          type: 'object',
          properties: {
            vehicle_id: { type: 'string' },
            license_plate: { type: 'string', example: 'WP-CAB-1234' },
            latitude: { type: 'number', example: 6.927079 },
            longitude: { type: 'number', example: 79.861244 },
            last_updated: { type: 'string', format: 'date-time' },
            current_district_id: { type: 'string' },
            is_online: { type: 'boolean', example: true },
          },
        },
      },

      responses: {
        UnauthorizedError: {
          description: 'Missing or invalid JWT token',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        ForbiddenError: {
          description: 'Insufficient permissions for this resource',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        NotFoundError: {
          description: 'The requested resource was not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        ValidationError: {
          description: 'Request body or query parameters failed validation',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },
    },

    security: [{ bearerAuth: [] }],
  },

  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

// Swagger UI OPTIONS
const swaggerUiOptions = {
  explorer: true,

  customCss: `
    /* GREEN TOP NAVBAR */
    .swagger-ui .topbar {
      display: flex !important;
      background: linear-gradient(90deg, #1b5e20, #1caa23) !important;
      height: 60px;
      align-items: center;
      padding: 0 20px;
    }

    .swagger-ui .topbar a,
    .swagger-ui .topbar .link {
      color: white !important;
      font-weight: bold;
    }

    /* TITLE */
    .swagger-ui .info {
      margin: 30px 0;
    }

    .swagger-ui .info .title {
      font-size: 32px;
      color: #1a3a6c;
      font-weight: bold;
    }

    /* BACKGROUND */
    body {
      background: #fafbfc;
    }

    /* METHOD COLORS */
    .swagger-ui .opblock.opblock-get { border-color: #61affe; background: rgba(97,175,254,.05) }
    .swagger-ui .opblock.opblock-post { border-color: #49cc90; background: rgba(73,204,144,.05) }
    .swagger-ui .opblock.opblock-put { border-color: #fca130; background: rgba(252,161,48,.05) }
    .swagger-ui .opblock.opblock-delete { border-color: #f93e3e; background: rgba(249,62,62,.05) }

    /* AUTHORIZE BUTTON */
    .swagger-ui .btn.authorize {
      background-color: #232523;
      border-color: #139a1a;
      color: green;
    }
  `,

  customSiteTitle: '🚖 Tuk-Tuk Tracker API — Sri Lanka Police',

  swaggerOptions: {
    persistAuthorization: true,
    docExpansion: 'none',
    filter: true,
    displayRequestDuration: true,
    tryItOutEnabled: true,
  },
};

module.exports = { swaggerSpec, swaggerUiOptions };
