const express = require('express')

const {getAllCostCentreType, newCostCentreType} = require('../controllers/costCentreType')

const router = express.Router()


// get all Cost Centre

router.get('/costcentres', getAllCostCentreType)


//Add New Cost Centre

router.post('/costcentres', newCostCentreType)

//update a Cost Centre

router.patch('/costcentres:id')

module.exports = router