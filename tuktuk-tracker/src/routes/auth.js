const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const auth = require('../controllers/authController');

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Log in with username & password
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string, example: admin }
 *               password: { type: string, format: password, example: Admin@1234 }
 *     responses:
 *       200:
 *         description: JWT issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     token: { type: string }
 *                     expires_in: { type: string, example: 12h }
 *                     user: { $ref: '#/components/schemas/User' }
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/login', auth.login);

/**
 * @swagger
 * /api/v1/auth/device-token:
 *   post:
 *     summary: Issue a long-lived JWT to a tracking device
 *     description: |
 *       Used during device provisioning. The device must already be registered as a Driver
 *       record with a `device_id` and a `current_vehicle_id`.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [device_id]
 *             properties:
 *               device_id: { type: string, example: DEV-A1B2C3D4 }
 *     responses:
 *       200: { description: Device token }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.post('/device-token', auth.issueDeviceToken);

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Get the current authenticated user
 *     tags: [Auth]
 *     responses:
 *       200: { description: Current user }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 */
router.get('/me', protect, auth.me);

/**
 * @swagger
 * /api/v1/auth/change-password:
 *   post:
 *     summary: Change your own password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [current_password, new_password]
 *             properties:
 *               current_password: { type: string, format: password }
 *               new_password: { type: string, format: password }
 *     responses:
 *       200: { description: Password changed }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 */
router.post('/change-password', protect, auth.changePassword);

module.exports = router;
