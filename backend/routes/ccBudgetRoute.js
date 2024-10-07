const express = require('express')

const { assignCCBudget, getCCBudgetForVerification, updateCCBudget, } = require('../controllers/ccBudget')
const { verifyToken } = require('../middlewares/requireAuth')



const router = express.Router()

router.post('/assignccbudget',verifyToken, assignCCBudget)

router.get('/getccbudgetforverification',verifyToken, getCCBudgetForVerification)

router.put('/updateccbudget/:id', verifyToken, updateCCBudget)




module.exports = router