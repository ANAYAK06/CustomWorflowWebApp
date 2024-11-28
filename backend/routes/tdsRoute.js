
const express = require('express')
const { checkTdsAccountExists,
    createTdsAccount,
    updateTdsAccount,
    getTdsAccountsForVerification,
    rejectTdsAccount,
    getAllTdsaccount
    
    
} = require('../controllers/tds')
const { verifyToken } = require('../middlewares/requireAuth')

const router = express.Router()






router.post('/createtdsaccount', verifyToken, createTdsAccount)
router.get('/gettdsaccountforverification', verifyToken, getTdsAccountsForVerification)
router.get('/checktdsaccountexist', verifyToken, checkTdsAccountExists)
router.put('/verifytdsaccount/:id', verifyToken, updateTdsAccount)
router.put('/rejecttdsaccount/:id', verifyToken, rejectTdsAccount)
router.get('/getalltdsaccount', verifyToken, getAllTdsaccount);


module.exports = router