const express = require('express')
const {createBusinessOpportunity,
    getOpportunitiesForVerification,
    updateBusinessOpportunity,
    getAllOpportunities, 
    rejectBusinessOpportunity,
    getApprovedAcceptedOpportunities} = require('../controllers/ProjectModule/bussinessOppertunity')
const { verifyToken } = require('../middlewares/requireAuth')


const router = express.Router()

router.post('/createoppertunity', verifyToken, createBusinessOpportunity)

router.get('/getoppertunityforverification', verifyToken, getOpportunitiesForVerification)

router.put('/updateoppertunity/:id', verifyToken, updateBusinessOpportunity)

router.put('/rejectoppertunity/:id', verifyToken, rejectBusinessOpportunity)

router.get('/getalloppertunity', verifyToken, getAllOpportunities )

router.get('/getacceptedoppertunity', verifyToken, getApprovedAcceptedOpportunities)

module.exports = router