const express = require('express')
const { verifyToken } = require('../middlewares/requireAuth')

const {dashboardPreferenceController} = require('../controllers/dashboardPreference')

const router = express.Router()

router.get('/dashboard-preferences', verifyToken, dashboardPreferenceController.getDashboardPreferences)

router.post('/dashboard-preferences', verifyToken, dashboardPreferenceController.saveDashboardPreferences)






module.exports = router