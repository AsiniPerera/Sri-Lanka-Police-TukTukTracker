const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize, requireScope, resolveScope } = require('../middleware/rbac');
const { ROLES, SCOPES } = require('../config/constants');
const ctrl = require('../controllers/userController');

router.use(protect, resolveScope);

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     summary: List users (HQ & Provincial; others see only themselves)
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: username
 *         schema: { type: string }
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [ADMIN_HQ, PROVINCIAL_OFFICER, DISTRICT_OFFICER, STATION_OFFICER, DEVICE_CLIENT]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE]
 *       - in: query
 *         name: scope_id
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Match across username and full_name
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Paginated users }
 */
router.get('/', requireScope(SCOPES.USERS_READ), authorize(ROLES.ADMIN_HQ, ROLES.PROVINCIAL_OFFICER), ctrl.list);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: User }
 */
router.get('/:id', requireScope(SCOPES.USERS_READ), authorize(ROLES.ADMIN_HQ, ROLES.PROVINCIAL_OFFICER), ctrl.getById);

/**
 * @swagger
 * /api/v1/users:
 *   post:
 *     summary: Create a new user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password, role]
 *             properties:
 *               username: { type: string, example: officer_silva }
 *               password: { type: string, format: password, example: 'Strong@Pass1' }
 *               full_name: { type: string, example: K.M. Silva }
 *               role:
 *                 type: string
 *                 enum: [ADMIN_HQ, PROVINCIAL_OFFICER, DISTRICT_OFFICER, STATION_OFFICER]
 *               scope_id:
 *                 type: string
 *                 description: Province / District / Station ID matching the role
 *     responses:
 *       201: { description: User created }
 */
router.post('/', requireScope(SCOPES.USERS_WRITE), authorize(ROLES.ADMIN_HQ, ROLES.PROVINCIAL_OFFICER), ctrl.create);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   put:
 *     summary: Update a user
 *     tags: [Users]
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
 *               full_name: { type: string }
 *               role: { type: string }
 *               scope_id: { type: string }
 *               status: { type: string, enum: [ACTIVE, INACTIVE] }
 *     responses:
 *       200: { description: Updated }
 */
router.put('/:id', requireScope(SCOPES.USERS_WRITE), authorize(ROLES.ADMIN_HQ, ROLES.PROVINCIAL_OFFICER), ctrl.update);

/**
 * @swagger
 * /api/v1/users/{id}/reset-password:
 *   patch:
 *     summary: Reset another user's password
 *     tags: [Users]
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
 *             required: [new_password]
 *             properties:
 *               new_password: { type: string, format: password }
 *     responses:
 *       200: { description: Password reset }
 */
router.patch('/:id/reset-password', requireScope(SCOPES.USERS_WRITE), authorize(ROLES.ADMIN_HQ, ROLES.PROVINCIAL_OFFICER), ctrl.resetPassword);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   delete:
 *     summary: Delete a user (HQ only)
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Deleted }
 */
router.delete('/:id', requireScope(SCOPES.USERS_WRITE), authorize(ROLES.ADMIN_HQ), ctrl.remove);

module.exports = router;
