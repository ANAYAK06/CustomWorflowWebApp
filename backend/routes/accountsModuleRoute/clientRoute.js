const express = require('express');
const { 
    createClient,
    getClientsForVerification,
    verifyClient,
    rejectClient,
    getActiveClients,
    getActiveClientById,
    createSubClient,
    getSubClientsForVerification,
    verifySubClient,
    rejectSubClient
} = require('../../AccountsModule/controller/clientController');

const { verifyToken } = require('../../middlewares/requireAuth');

const router = express.Router();

router.post('/create', verifyToken, createClient);

// Verification Routes
router.get('/verification', verifyToken, getClientsForVerification);
router.put('/verify/:id', verifyToken, verifyClient);
router.put('/reject/:id', verifyToken, rejectClient);

// Active Client Routes
router.get('/active', verifyToken, getActiveClients);
router.get('/active/:id', verifyToken, getActiveClientById);

// SubClient Routes
// --------------
// Creation Route
router.post('/subclient/create', verifyToken, createSubClient);

// Verification Routes
router.get('/subclient/verification', verifyToken, getSubClientsForVerification);
router.put('/subclient/verify/:id', verifyToken, verifySubClient);
router.put('/subclient/reject/:id', verifyToken, rejectSubClient);
// Active Client Routes
router.get('/active', verifyToken, getActiveClients);
router.get('/active/:id', verifyToken, getActiveClientById);

module.exports = router;