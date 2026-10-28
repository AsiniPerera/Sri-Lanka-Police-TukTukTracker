const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize, requireScope, resolveScope } = require('../middleware/rbac');
const { ROLES, SCOPES } = require('../config/constants');
const ctrl = require('../controllers/liveController');

router.use(
  protect,
  authorize(ROLES.ADMIN_HQ, ROLES.PROVINCIAL_OFFICER, ROLES.DISTRICT_OFFICER, ROLES.STATION_OFFICER),
  resolveScope
);

/**
 * @swagger
 * /api/v1/live:
 *   get:
 *     summary: Live status of all vehicles in your scope
 *     description: |
 *       Returns the most recent location for each vehicle the user is allowed to see.
 *       A vehicle is considered "online" if it has pinged in the last 10 minutes.
 *     tags: [Live Tracking]
 *     parameters:
 *       - in: query
 *         name: province_id
 *         schema: { type: string }
 *       - in: query
 *         name: district_id
 *         schema: { type: string }
 *       - in: query
 *         name: station_id
 *         schema: { type: string }
 *       - in: query
 *         name: vehicle_status
 *         schema:
 *           type: string
 *           enum: [REGISTERED, SUSPENDED, WANTED, DECOMMISSIONED]
 *       - in: query
 *         name: license_plate
 *         schema: { type: string }
 *       - in: query
 *         name: online
 *         schema: { type: string, enum: [true, false] }
 *       - in: query
 *         name: minSpeed
 *         schema: { type: number }
 *       - in: query
 *         name: maxSpeed
 *         schema: { type: number }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Paginated live status list }
 */
router.get('/', requireScope(SCOPES.LIVE_READ), ctrl.list);

/**
 * @swagger
 * /api/v1/live/stats:
 *   get:
 *     summary: Aggregate counts (online / offline / wanted / suspended) within scope
 *     tags: [Live Tracking]
 *     responses:
 *       200: { description: Stats }
 */
router.get('/stats', requireScope(SCOPES.LIVE_READ), ctrl.stats);

/**
 * @swagger
 * /api/v1/live/vehicle/{vehicleId}:
 *   get:
 *     summary: Live status of a specific vehicle
 *     tags: [Live Tracking]
 *     parameters:
 *       - in: path
 *         name: vehicleId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Live status }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.get('/vehicle/:vehicleId', requireScope(SCOPES.LIVE_READ), ctrl.getOne);

module.exports = router;
