const express = require('express')

const {getNotification, getNotificationCount } = require('../controllers/nofification')
const {verifyToken} = require('../middlewares/requireAuth')

const router = express.Router()

router.get('/notification',verifyToken, getNotification)
router.get('/notificationcount',verifyToken, getNotificationCount)





module.exports = router 