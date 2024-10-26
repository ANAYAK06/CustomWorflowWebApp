const express = require('express')
const {createGeneralLedger, getGeneralLedgerForVerification, checkLedgerNameExists, updateGeneralLedger, rejectLedger} = require('../controllers/accountsLedger')
const { verifyToken } = require('../middlewares/requireAuth')


const router = express.Router()


router.post('/creategeneralledger',verifyToken, createGeneralLedger)
router.get('/getgeneralledgerforverification', verifyToken, getGeneralLedgerForVerification)
router.get('/checkledgernameexists', verifyToken, checkLedgerNameExists)
router.put('/verifygeneralledger/:id', verifyToken, updateGeneralLedger)
router.put('/rejectgeneralledger/:id', verifyToken, rejectLedger)





module.exports = router