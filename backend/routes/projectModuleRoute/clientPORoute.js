const express = require('express');
const { 
    getPerformingCostCentres,
    getWonBOQs,
    getClientDetails,
    createClientPO,
    getPOsForVerification,
    verifyClientPO,
    rejectClientPO,
    getAllClients,
    getSubClients
} = require('../../ProjectModule/controllers/clientPOController');

const { verifyToken } = require('../../middlewares/requireAuth');

const router = express.Router();

// Supporting Data Routes
router.get('/cost-centres', verifyToken, getPerformingCostCentres);
router.get('/boq/won', verifyToken, getWonBOQs);
router.get('/client/:clientId', verifyToken, getClientDetails);
router.get('/clients', verifyToken, getAllClients)
router.get('/clients/:clientId/subclients', verifyToken, getSubClients)


// Client PO Routes
router.post('/create', verifyToken, createClientPO);

// Verification Routes
router.get('/verification', verifyToken, getPOsForVerification);
router.put('/verify/:id', verifyToken, verifyClientPO);
router.put('/reject/:id', verifyToken, rejectClientPO);


module.exports = router;