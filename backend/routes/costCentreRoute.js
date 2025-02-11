const express = require('express')

const { verifyToken } = require('../middlewares/requireAuth')

const {createNewCostCentre, 
    getAllCostCentreData, 
    getCCDataforVerification, 
    updateCostCentre, 
    checkCCNoExists, 
    rejectCostCentre, 
    getEligibleCCForBudgetAssign,
    getAllCCCode} = require('../controllers/cccode')


const router = express.Router()


// new Cost Centre

router.post('/createnewcostcentre',verifyToken, createNewCostCentre)


//Get All cost centre Data

router.get('/allcostcentredata', getAllCostCentreData)

// getData for Verification

router.get('/getccforverification',verifyToken, getCCDataforVerification)

//update cost Centre

router.put('/updatecostcentre/:id',verifyToken, updateCostCentre)

// check ccNo exists

router.get('/checkccno/:ccNo', checkCCNoExists)

// reject Cost Centre

router.put('/rejectcostcentre/:id',verifyToken, rejectCostCentre)

// cost Centre for CC Budget Assign 

router.get('/geteligibleccforbudgetassign', getEligibleCCForBudgetAssign)

// get cc codes approved cc codes for dropdown

router.get('/getcccodes', verifyToken, getAllCCCode)



module.exports = router