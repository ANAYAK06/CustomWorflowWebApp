const express = require('express')

const {assignCostCentre, usersWithCostCentreApplicable, getAvaialbleCostCentres, viewUsersCostCentres, updateUserCostCentres, deleteUserCostCentres} = require('../controllers/userCostCentres')


const router = express.Router()

router.post('/assigncostcentre', assignCostCentre)
router.get('/getunassignedcostcentre/:userId', getAvaialbleCostCentres)

router.get('/userwithcostcentre', usersWithCostCentreApplicable)

router.get('/viewuserassignedcostcentres', viewUsersCostCentres)

router.put('/updatecostcentre', updateUserCostCentres)
router.delete('/deletecostcentre', deleteUserCostCentres)



module.exports = router