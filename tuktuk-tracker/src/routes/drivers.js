const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize, requireScope, resolveScope } = require('../middleware/rbac');
const { ROLES, SCOPES } = require('../config/constants');
const ctrl = require('../controllers/driverController');

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
 * /api/v1/drivers:
 *   get:
 *     summary: List drivers with multi-field filtering
 *     tags: [Drivers]
 *     parameters:
 *       - in: query
 *         name: full_name
 *         schema: { type: string }
 *         description: Partial, case-insensitive name match
 *       - in: query
 *         name: nic_number
 *         schema: { type: string }
 *       - in: query
 *         name: phone_number
 *         schema: { type: string }
 *       - in: query
 *         name: device_id
 *         schema: { type: string }
 *       - in: query
 *         name: current_vehicle_id
 *         schema: { type: string }
 *       - in: query
 *         name: assigned
 *         schema: { type: string, enum: [true, false] }
 *         description: Filter drivers with or without assigned vehicles
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Match across name, NIC, phone and device
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: sort
 *         schema: { type: string, example: 'full_name:asc' }
 *     responses:
 *       200: { description: Paginated drivers }
 */
router.get('/', requireScope(SCOPES.DRIVERS_READ), authorize(...OFFICER_ROLES), ctrl.list);

/**
 * @swagger
 * /api/v1/drivers/{id}:
 *   get:
 *     summary: Get driver by ID
 *     tags: [Drivers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Driver }
 */
router.get('/:id', requireScope(SCOPES.DRIVERS_READ), authorize(...OFFICER_ROLES), ctrl.getById);

/**
 * @swagger
 * /api/v1/drivers:
 *   post:
 *     summary: Register a new driver
 *     tags: [Drivers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nic_number, full_name, phone_number, device_id]
 *             properties:
 *               nic_number: { type: string, example: '199012345678' }
 *               full_name: { type: string, example: Sunil Fernando }
 *               phone_number: { type: string, example: '+94771234567' }
 *               device_id: { type: string, example: DEV-A1B2C3D4 }
 *               current_vehicle_id: { type: string, nullable: true }
 *     responses:
 *       201: { description: Driver created }
 */
router.post('/', requireScope(SCOPES.DRIVERS_WRITE), authorize(ROLES.ADMIN_HQ, ROLES.PROVINCIAL_OFFICER), ctrl.create);

/**
 * @swagger
 * /api/v1/drivers/{id}:
 *   patch:
 *     summary: Update driver (partial update)
 *     description: >
 *       Same handler as PUT. Only the fields present in the body are applied,
 *       so a PATCH with a single field leaves every other field untouched.
 *     tags: [Drivers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Driver' }
 *     responses:
 *       200: { description: Updated }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
/**
 * @swagger
 * /api/v1/drivers/{id}:
 *   put:
 *     summary: Update driver
 *     tags: [Drivers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Driver' }
 *     responses:
 *       200: { description: Updated }
 */
router.route('/:id')
  .put(requireScope(SCOPES.DRIVERS_WRITE), authorize(ROLES.ADMIN_HQ, ROLES.PROVINCIAL_OFFICER), ctrl.update)
  .patch(requireScope(SCOPES.DRIVERS_WRITE), authorize(ROLES.ADMIN_HQ, ROLES.PROVINCIAL_OFFICER), ctrl.update);

/**
 * @swagger
 * /api/v1/drivers/{id}/assign-vehicle:
 *   patch:
 *     summary: Assign or unassign a driver to a vehicle
 *     tags: [Drivers]
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
 *               vehicle_id: { type: string, nullable: true }
 *     responses:
 *       200: { description: Assignment updated }
 */
router.patch('/:id/assign-vehicle', requireScope(SCOPES.DRIVERS_WRITE), authorize(ROLES.ADMIN_HQ, ROLES.PROVINCIAL_OFFICER), ctrl.assignVehicle);

/**
 * @swagger
 * /api/v1/drivers/{id}:
 *   delete:
 *     summary: Delete driver (HQ only)
 *     tags: [Drivers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Deleted }
 */
router.delete('/:id', requireScope(SCOPES.DRIVERS_DELETE), authorize(ROLES.ADMIN_HQ), ctrl.remove);

module.exports = router;
