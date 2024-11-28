const express = require('express')
const { 
    createLoan,
    getLoansForVerification,
    checkLoanNumberExists,
    updateLoan,
    rejectLoan,
    getLoanSchedule,
    getLoanSummary
} = require('../controllers/LoanAccount')
const { verifyToken } = require('../middlewares/requireAuth')

const router = express.Router()

// Loan creation and verification routes
router.post('/createloan', verifyToken, createLoan)
router.get('/getloansforverification', verifyToken, getLoansForVerification)
router.get('/checkloannumberexists', verifyToken, checkLoanNumberExists)
router.put('/verifyloan/:id', verifyToken, updateLoan)
router.put('/rejectloan/:id', verifyToken, rejectLoan)
router.get('/getloanschedule/:id', verifyToken, getLoanSchedule);
router.get('/getloansummary/:id', verifyToken, getLoanSummary);

module.exports = router