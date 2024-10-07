const express = require('express')
const {createGeneralLedger} = require('../controllers/accountsLedger')


const router = express.Router()


router.post('/creategeneralledger', createGeneralLedger)



module.exports = router