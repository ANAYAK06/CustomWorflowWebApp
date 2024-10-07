const express = require('express')

const {assignCostCentre, usersWithCostCentreApplicable, getAvaialbleCostCentres, viewUsersCostCentres} = require('../controllers/userCostCentres')


const router = express.Router()

router.post('/assigncostcentre', assignCostCentre)
router.get('/getunassignedcostcentre/:userId', getAvaialbleCostCentres)

router.get('/userwithcostcentre', usersWithCostCentreApplicable)

router.get('/viewuserassignedcostcentres', viewUsersCostCentres)



module.exports = router