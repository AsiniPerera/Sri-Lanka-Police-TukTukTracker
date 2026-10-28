const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize, requireScope, resolveScope } = require('../middleware/rbac');
const { ROLES, SCOPES } = require('../config/constants');
const ctrl = require('../controllers/locationController');

/**
 * @swagger
 * /api/v1/locations/ping:
 *   post:
 *     summary: Ingest a location ping (DEVICE_CLIENT only)
 *     description: |
 *       Called by the on-vehicle tracking hardware. The vehicle is identified
 *       implicitly via the device JWT — never trust a vehicle_id from the body.
 *     tags: [Locations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude]
 *             properties:
 *               latitude: { type: number, example: 6.927079 }
 *               longitude: { type: number, example: 79.861244 }
 *               speed: { type: number, example: 35.5, description: km/h }
 *               heading: { type: number, example: 180, description: 0-359° }
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *                 description: Optional. Defaults to now.
 *     responses:
 *       201: { description: Ping recorded }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 */
router.post('/ping', protect, requireScope(SCOPES.LOCATIONS_WRITE), authorize(ROLES.DEVICE_CLIENT), ctrl.ingestPing);

/**
 * @swagger
 * /api/v1/locations:
 *   get:
 *     summary: List location pings across the caller's scope
 *     description: |
 *       Fleet-wide ping feed, newest first. Results are limited to vehicles
 *       stationed within the caller's scope; ADMIN_HQ sees everything.
 *     tags: [Locations]
 *     parameters:
 *       - in: query
 *         name: vehicle_id
 *         schema: { type: string }
 *         description: Narrow to a single vehicle. Must be inside the caller's scope.
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: minSpeed
 *         schema: { type: number }
 *       - in: query
 *         name: maxSpeed
 *         schema: { type: number }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: sort
 *         schema: { type: string, example: 'timestamp:desc' }
 *     responses:
 *       200: { description: Paginated location pings }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 */
router.get(
  '/',
  protect,
  authorize(ROLES.ADMIN_HQ, ROLES.PROVINCIAL_OFFICER, ROLES.DISTRICT_OFFICER, ROLES.STATION_OFFICER),
  requireScope(SCOPES.LOCATIONS_READ),
  resolveScope,
  ctrl.list
);

/**
 * @swagger
 * /api/v1/locations/vehicle/{vehicleId}:
 *   get:
 *     summary: Get historical pings for a vehicle (time-window investigation)
 *     tags: [Locations]
 *     parameters:
 *       - in: path
 *         name: vehicleId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *         description: Start of time window (inclusive)
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *         description: End of time window (inclusive)
 *       - in: query
 *         name: minSpeed
 *         schema: { type: number }
 *       - in: query
 *         name: maxSpeed
 *         schema: { type: number }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25 }
 *       - in: query
 *         name: sort
 *         schema: { type: string, example: 'timestamp:desc' }
 *     responses:
 *       200: { description: Paginated location history }
 */
router.get(
  '/vehicle/:vehicleId',
  protect,
  authorize(ROLES.ADMIN_HQ, ROLES.PROVINCIAL_OFFICER, ROLES.DISTRICT_OFFICER, ROLES.STATION_OFFICER),
  requireScope(SCOPES.LOCATIONS_READ),
  resolveScope,
  ctrl.history
);

/**
 * @swagger
 * /api/v1/locations/vehicle/{vehicleId}/latest:
 *   get:
 *     summary: Get the most recent ping for a vehicle
 *     tags: [Locations]
 *     parameters:
 *       - in: path
 *         name: vehicleId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Latest ping }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.get(
  '/vehicle/:vehicleId/latest',
  protect,
  authorize(ROLES.ADMIN_HQ, ROLES.PROVINCIAL_OFFICER, ROLES.DISTRICT_OFFICER, ROLES.STATION_OFFICER),
  requireScope(SCOPES.LOCATIONS_READ),
  resolveScope,
  ctrl.latest
);

module.exports = router;
