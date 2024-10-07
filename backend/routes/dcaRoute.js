const express = require('express')

const {createDCA,updateDCA,getDCAForDropdown, getDCACodes} = require('../controllers/dcacodes')
const { createSubDCA } = require('../controllers/subDCACodes')

const router = express.Router()

router.post('/createdcacode', createDCA)
router.patch('/updatedcacode', updateDCA)
router.get('/getconnecteddcacodes', getDCAForDropdown)
router.get('/getdcacodes', getDCACodes)
router.post('/createsubdca', createSubDCA)


module.exports = router