const express = require('express')
const { checkFDAccountExists,
    createFixedDeposit,
    updateFixedDeposit,
    rejectFixedDeposit,
    getFDSummary,
    getFDsForVerification,
    getAllFixedDeposits
    
} = require('../controllers/fixedDeposit')
const { verifyToken } = require('../middlewares/requireAuth')

const router = express.Router()

// Loan creation and verification routes
router.post('/createfixeddeposit', verifyToken, createFixedDeposit)
router.get('/getfdsforverification', verifyToken, getFDsForVerification)
router.get('/checkfdaccountexists', verifyToken, checkFDAccountExists)
router.put('/verifyfixeddeposit/:id', verifyToken, updateFixedDeposit)
router.put('/rejectfixeddeposit/:id', verifyToken, rejectFixedDeposit)
router.get('/getfdsummary/:id', verifyToken, getFDSummary);
router.get('/getallfixeddeposits', verifyToken, getAllFixedDeposits);

module.exports = router