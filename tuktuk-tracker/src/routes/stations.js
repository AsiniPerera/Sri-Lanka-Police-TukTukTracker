const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize, requireScope, resolveScope } = require('../middleware/rbac');
const { ROLES, SCOPES } = require('../config/constants');
const ctrl = require('../controllers/stationController');

/**
 * Every human officer role. Read routes list this explicitly so that a
 * DEVICE_CLIENT token -- issued to on-vehicle GPS hardware -- cannot read the
 * registry. Without an authorize(...) call a route accepts *any* authenticated
 * principal, devices included.
 */
const OFFICER_ROLES = [
  ROLES.ADMIN_HQ,
  ROLES.PROVINCIAL_OFFICER,
  ROLES.DISTRICT_OFFICER,
  ROLES.STATION_OFFICER,
];

router.use(protect, resolveScope);

/**
 * @swagger
 * /api/v1/stations:
 *   get:
 *     summary: List police stations (scope-filtered)
 *     tags: [Police Stations]
 *     parameters:
 *       - in: query
 *         name: station_name
 *         schema: { type: string }
 *         description: Partial, case-insensitive match
 *       - in: query
 *         name: station_code
 *         schema: { type: string }
 *       - in: query
 *         name: contact_number
 *         schema: { type: string }
 *       - in: query
 *         name: district_id
 *         schema: { type: string }
 *       - in: query
 *         name: province_id
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search across name and code
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25 }
 *       - in: query
 *         name: sort
 *         schema: { type: string, example: 'station_name:asc' }
 *     responses:
 *       200: { description: Paginated stations }
 */
router.get('/', authorize(...OFFICER_ROLES), ctrl.list);

/**
 * @swagger
 * /api/v1/stations/{id}:
 *   get:
 *     summary: Get station by ID
 *     tags: [Police Stations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Station }
 */
router.get('/:id', authorize(...OFFICER_ROLES), ctrl.getById);

/**
 * @swagger
 * /api/v1/stations:
 *   post:
 *     summary: Create a station (HQ or Provincial Officer)
 *     tags: [Police Stations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [station_name, station_code, district_id, contact_number]
 *             properties:
 *               station_name: { type: string, example: Colombo Central Police Station }
 *               station_code: { type: string, example: CMB-CTR-01 }
 *               district_id: { type: string }
 *               contact_number: { type: string, example: '+94112345678' }
 *     responses:
 *       201: { description: Station created }
 */
router.post('/', requireScope(SCOPES.GEO_WRITE), authorize(ROLES.ADMIN_HQ, ROLES.PROVINCIAL_OFFICER), ctrl.create);

/**
 * @swagger
 * /api/v1/stations/{id}:
 *   put:
 *     summary: Update a station (HQ or Provincial)
 *     tags: [Police Stations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               station_name: { type: string }
 *               station_code: { type: string }
 *               district_id: { type: string }
 *               contact_number: { type: string }
 *     responses:
 *       200: { description: Updated }
 */
router.put('/:id', requireScope(SCOPES.GEO_WRITE), authorize(ROLES.ADMIN_HQ, ROLES.PROVINCIAL_OFFICER), ctrl.update);

/**
 * @swagger
 * /api/v1/stations/{id}:
 *   delete:
 *     summary: Delete a station (HQ only)
 *     tags: [Police Stations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Deleted }
 *       409: { description: Station has registered vehicles }
 */
router.delete('/:id', requireScope(SCOPES.GEO_WRITE), authorize(ROLES.ADMIN_HQ), ctrl.remove);

module.exports = router;
