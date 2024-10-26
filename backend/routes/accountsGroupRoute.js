const express = require('express')
const { getAllGroupDetails, createAccountsGroup, createSubgroup, checkGroupNameExists, getGroupsForVerification, updateGroup, rejectGroup } = require('../controllers/accountsGroup')
const { verifyToken } = require('../middlewares/requireAuth')




const router = express.Router()


router.get('/getallaccountsgroups', getAllGroupDetails)

router.post('/createnewaccountgroup', createAccountsGroup)

router.post('/create-subgroups', verifyToken, createSubgroup)

router.get('/checkgroupnameexists', verifyToken, checkGroupNameExists)

router.get('/getgroupforverification', verifyToken, getGroupsForVerification)

router.put('/verifynewgroup/:id', verifyToken, updateGroup)

router.put('/rejectnewgroup/:id', verifyToken, rejectGroup)


module.exports = router