const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize, requireScope, resolveScope } = require('../middleware/rbac');
const { ROLES, SCOPES } = require('../config/constants');
const ctrl = require('../controllers/vehicleController');

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
 * /api/v1/vehicles:
 *   get:
 *     summary: List registered three-wheelers (scope-filtered)
 *     description: |
 *       Supports rich filtering. All text filters are case-insensitive partial matches.
 *       Province / District officers see only vehicles in their jurisdiction.
 *     tags: [Vehicles]
 *     parameters:
 *       - in: query
 *         name: license_plate
 *         schema: { type: string }
 *       - in: query
 *         name: owner_name
 *         schema: { type: string }
 *       - in: query
 *         name: owner_nic
 *         schema: { type: string }
 *       - in: query
 *         name: chassis_number
 *         schema: { type: string }
 *       - in: query
 *         name: engine_number
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [REGISTERED, SUSPENDED, WANTED, DECOMMISSIONED]
 *       - in: query
 *         name: station_id
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
 *         description: Match across plate, owner, NIC and chassis
 *       - in: query
 *         name: createdAfter
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: createdBefore
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25 }
 *       - in: query
 *         name: sort
 *         schema: { type: string, example: 'createdAt:desc' }
 *     responses:
 *       200: { description: Paginated vehicles }
 */
router.get('/', requireScope(SCOPES.VEHICLES_READ), authorize(...OFFICER_ROLES), ctrl.list);

/**
 * @swagger
 * /api/v1/vehicles/by-plate/{plate}:
 *   get:
 *     summary: Quick lookup by license plate (investigative)
 *     tags: [Vehicles]
 *     parameters:
 *       - in: path
 *         name: plate
 *         required: true
 *         schema: { type: string }
 *         example: WP-CAB-1234
 *     responses:
 *       200: { description: Vehicle }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.get('/by-plate/:plate', requireScope(SCOPES.VEHICLES_READ), authorize(...OFFICER_ROLES), ctrl.getByPlate);

/**
 * @swagger
 * /api/v1/vehicles/{id}:
 *   get:
 *     summary: Get vehicle by ID
 *     tags: [Vehicles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Vehicle }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.get('/:id', requireScope(SCOPES.VEHICLES_READ), authorize(...OFFICER_ROLES), ctrl.getById);

/**
 * @swagger
 * /api/v1/vehicles:
 *   post:
 *     summary: Register a new tuk-tuk (HQ / Provincial / District)
 *     tags: [Vehicles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [license_plate, chassis_number, engine_number, owner_name, owner_nic, station_id]
 *             properties:
 *               license_plate: { type: string, example: WP-CAB-9876 }
 *               chassis_number: { type: string, example: CHS-99887766 }
 *               engine_number: { type: string, example: ENG-11223344 }
 *               owner_name: { type: string, example: Nimal Perera }
 *               owner_nic: { type: string, example: '199012345678' }
 *               station_id: { type: string }
 *               status:
 *                 type: string
 *                 enum: [REGISTERED, SUSPENDED, WANTED, DECOMMISSIONED]
 *                 default: REGISTERED
 *     responses:
 *       201: { description: Vehicle registered }
 */
router.post('/', requireScope(SCOPES.VEHICLES_WRITE), authorize(ROLES.ADMIN_HQ, ROLES.PROVINCIAL_OFFICER), ctrl.create);

/**
 * @swagger
 * /api/v1/vehicles/{id}:
 *   patch:
 *     summary: Update vehicle details (partial update)
 *     description: >
 *       Same handler as PUT. Only the fields present in the body are applied,
 *       so a PATCH with a single field leaves every other field untouched.
 *     tags: [Vehicles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Vehicle' }
 *     responses:
 *       200: { description: Updated }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
/**
 * @swagger
 * /api/v1/vehicles/{id}:
 *   put:
 *     summary: Update vehicle details
 *     tags: [Vehicles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Vehicle' }
 *     responses:
 *       200: { description: Updated }
 */
router.route('/:id')
  .put(requireScope(SCOPES.VEHICLES_WRITE), authorize(ROLES.ADMIN_HQ, ROLES.PROVINCIAL_OFFICER), ctrl.update)
  .patch(requireScope(SCOPES.VEHICLES_WRITE), authorize(ROLES.ADMIN_HQ, ROLES.PROVINCIAL_OFFICER), ctrl.update);

/**
 * @swagger
 * /api/v1/vehicles/{id}/status:
 *   patch:
 *     summary: Mark vehicle as REGISTERED / SUSPENDED / WANTED / DECOMMISSIONED
 *     tags: [Vehicles]
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [REGISTERED, SUSPENDED, WANTED, DECOMMISSIONED]
 *     responses:
 *       200: { description: Status updated }
 */
router.patch('/:id/status', requireScope(SCOPES.VEHICLES_WRITE), authorize(ROLES.ADMIN_HQ, ROLES.PROVINCIAL_OFFICER), ctrl.updateStatus);

/**
 * @swagger
 * /api/v1/vehicles/{id}:
 *   delete:
 *     summary: Delete a vehicle record (HQ only)
 *     tags: [Vehicles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Deleted }
 */
router.delete('/:id', requireScope(SCOPES.VEHICLES_DELETE), authorize(ROLES.ADMIN_HQ), ctrl.remove);

module.exports = router;
