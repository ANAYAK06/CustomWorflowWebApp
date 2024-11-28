const express = require('express')
const { 
    createBankAccount, 
    getBankAccountsForVerification, 
    checkBankAccountExists, 
    updateBankAccount, 
    rejectBankAccount, 
    getAllBankAccounts
} = require('../controllers/bankAccounts')
const { verifyToken } = require('../middlewares/requireAuth')

const router = express.Router()

// Bank account creation and verification
router.post('/createbankaccount', verifyToken, createBankAccount)
router.get('/getbankaccountsforverification', verifyToken, getBankAccountsForVerification)
router.get('/checkbankaccountexists', verifyToken, checkBankAccountExists)
router.put('/verifybankaccount/:id', verifyToken, updateBankAccount)
router.put('/rejectbankaccount/:id', verifyToken, rejectBankAccount)
router.get('/getallbankaccounts', verifyToken, getAllBankAccounts)
module.exports = router