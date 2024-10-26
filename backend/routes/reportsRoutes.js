const express = require('express')

const {getBalanceSheet} = require('../controllers/ReportControllers/balanceSheet')
const {getProfitAndLoss} = require('../controllers/ReportControllers/profitandLoss')



const router = express.Router()

router.get('/balance-sheet', getBalanceSheet)

router.get('/profit-and-loss', getProfitAndLoss)



module.exports = router