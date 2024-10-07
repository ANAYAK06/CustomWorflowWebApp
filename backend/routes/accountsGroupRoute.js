const express = require('express')
const { getAllGroupDetails, createAccountsGroup } = require('../controllers/accountsGroup')




const router = express.Router()


router.get('/getallaccountsgroups', getAllGroupDetails)


router.post('/createnewaccountgroup', createAccountsGroup)

module.exports = router