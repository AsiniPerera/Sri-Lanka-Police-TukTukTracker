const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize, requireScope, resolveScope } = require('../middleware/rbac');
const { ROLES, SCOPES } = require('../config/constants');
const ctrl = require('../controllers/provinceController');

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
 * /api/v1/provinces:
 *   get:
 *     summary: List all provinces
 *     tags: [Provinces]
 *     parameters:
 *       - in: query
 *         name: name
 *         schema: { type: string }
 *         description: Partial, case-insensitive name match
 *       - in: query
 *         name: code
 *         schema: { type: string }
 *         description: Exact 2-letter code (e.g. WP)
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
 *         schema: { type: string, example: 'name:asc' }
 *     responses:
 *       200:
 *         description: Paginated list of provinces
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PaginatedResponse' }
 */
router.get('/', authorize(...OFFICER_ROLES), ctrl.list);

/**
 * @swagger
 * /api/v1/provinces/{id}:
 *   get:
 *     summary: Get a province by ID
 *     tags: [Provinces]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Province }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.get('/:id', authorize(...OFFICER_ROLES), ctrl.getById);

/**
 * @swagger
 * /api/v1/provinces/{id}/districts:
 *   get:
 *     summary: List districts within a province
 *     tags: [Provinces]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Districts in the province }
 */
router.get('/:id/districts', authorize(...OFFICER_ROLES), ctrl.listDistricts);

/**
 * @swagger
 * /api/v1/provinces:
 *   post:
 *     summary: Create a new province (HQ only)
 *     tags: [Provinces]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, code]
 *             properties:
 *               name: { type: string, example: Western }
 *               code: { type: string, example: WP }
 *     responses:
 *       201: { description: Province created }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 */
router.post('/', requireScope(SCOPES.GEO_WRITE), authorize(ROLES.ADMIN_HQ), ctrl.create);

/**
 * @swagger
 * /api/v1/provinces/{id}:
 *   patch:
 *     summary: Update a province, partial (HQ only)
 *     description: >
 *       Same handler as PUT. Only the fields present in the body are applied,
 *       so a PATCH with a single field leaves every other field untouched.
 *     tags: [Provinces]
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
 *               code: { type: string }
 *     responses:
 *       200: { description: Updated province }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
/**
 * @swagger
 * /api/v1/provinces/{id}:
 *   put:
 *     summary: Update a province (HQ only)
 *     tags: [Provinces]
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
 *               code: { type: string }
 *     responses:
 *       200: { description: Updated province }
 */
router.route('/:id')
  .put(requireScope(SCOPES.GEO_WRITE), authorize(ROLES.ADMIN_HQ), ctrl.update)
  .patch(requireScope(SCOPES.GEO_WRITE), authorize(ROLES.ADMIN_HQ), ctrl.update);

/**
 * @swagger
 * /api/v1/provinces/{id}:
 *   delete:
 *     summary: Delete a province (HQ only)
 *     tags: [Provinces]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Deleted }
 *       409: { description: Province has child districts }
 */
router.delete('/:id', requireScope(SCOPES.GEO_WRITE), authorize(ROLES.ADMIN_HQ), ctrl.remove);

module.exports = router;
