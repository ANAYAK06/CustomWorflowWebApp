const express = require('express')

const {createNewCostCentre, 
    getAllCostCentreData, 
    getCCDataforVerification, 
    updateCostCentre, 
    checkCCNoExists, 
    rejectCostCentre, 
    getEligibleCCForBudgetAssign} = require('../controllers/cccode')

const router = express.Router()


// new Cost Centre

router.post('/createcostcentre', createNewCostCentre)


//Get All cost centre Data

router.get('/allcostcentredata', getAllCostCentreData)

// getData for Verification

router.get('/costcentreverification', getCCDataforVerification)

//update cost Centre

router.patch('/verifycostcentre/:id', updateCostCentre)

// check ccNo exists

router.get('/checkccno/:ccNo', checkCCNoExists)

// reject Cost Centre

router.patch('/rejectcostcentre/:id', rejectCostCentre)

// cost Centre for CC Budget Assign 

router.get('/eligiblecostcentrefor-buget', getEligibleCCForBudgetAssign)


module.exports = router