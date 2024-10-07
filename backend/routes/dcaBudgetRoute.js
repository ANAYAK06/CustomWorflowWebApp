const express = require('express')
const { verifyToken } = require('../middlewares/requireAuth')

const {getEligibleCCs, 
    getDCAForCC,
     assignDCABudget, 
     getFiscalYearsForCC, getBudgetForCCAndFiscalYear, getDCABudgetForVerification, updateDCABudget, 
     rejectDCABudget} = require('../controllers/dcaBudget')

const router = express.Router()

router.get('/eligible-ccs', getEligibleCCs)

router.get('/dca-for-ccs', getDCAForCC)

router.post('/assigndcabudget',verifyToken, assignDCABudget )

router.get('/fiscal-years-for-budget',verifyToken, getFiscalYearsForCC)

router.get('/cc-budget-in-fiscalyears',verifyToken, getBudgetForCCAndFiscalYear)

router.get('/getdcabudget-for-verification', verifyToken, getDCABudgetForVerification)

router.put('/update-dca-budget', verifyToken, updateDCABudget)

router.put('/reject-dca-budget', verifyToken, rejectDCABudget)

module.exports = router