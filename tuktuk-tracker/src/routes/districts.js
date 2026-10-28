const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize, requireScope, resolveScope } = require('../middleware/rbac');
const { ROLES, SCOPES } = require('../config/constants');
const ctrl = require('../controllers/districtController');

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
 * /api/v1/districts:
 *   get:
 *     summary: List districts (scope-filtered)
 *     tags: [Districts]
 *     parameters:
 *       - in: query
 *         name: name
 *         schema: { type: string }
 *       - in: query
 *         name: province_id
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25 }
 *     responses:
 *       200: { description: Paginated districts }
 */
router.get('/', authorize(...OFFICER_ROLES), ctrl.list);

/**
 * @swagger
 * /api/v1/districts/{id}:
 *   get:
 *     summary: Get district by ID
 *     tags: [Districts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: District }
 */
router.get('/:id', authorize(...OFFICER_ROLES), ctrl.getById);

/**
 * @swagger
 * /api/v1/districts/{id}/stations:
 *   get:
 *     summary: List police stations within a district
 *     tags: [Districts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Stations in the district }
 */
router.get('/:id/stations', authorize(...OFFICER_ROLES), ctrl.listStations);

/**
 * @swagger
 * /api/v1/districts:
 *   post:
 *     summary: Create a district (HQ only)
 *     tags: [Districts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, province_id]
 *             properties:
 *               name: { type: string, example: Colombo }
 *               province_id: { type: string }
 *     responses:
 *       201: { description: District created }
 */
router.post('/', requireScope(SCOPES.GEO_WRITE), authorize(ROLES.ADMIN_HQ), ctrl.create);

/**
 * @swagger
 * /api/v1/districts/{id}:
 *   put:
 *     summary: Update a district (HQ only)
 *     tags: [Districts]
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
 *               name: { type: string }
 *               province_id: { type: string }
 *     responses:
 *       200: { description: Updated }
 */
router.put('/:id', requireScope(SCOPES.GEO_WRITE), authorize(ROLES.ADMIN_HQ), ctrl.update);

/**
 * @swagger
 * /api/v1/districts/{id}:
 *   delete:
 *     summary: Delete a district (HQ only)
 *     tags: [Districts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Deleted }
 *       409: { description: District has child stations }
 */
router.delete('/:id', requireScope(SCOPES.GEO_WRITE), authorize(ROLES.ADMIN_HQ), ctrl.remove);

module.exports = router;
