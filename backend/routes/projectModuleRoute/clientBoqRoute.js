const express = require('express');
const { 
    createClientBOQ,
    getClientBOQsForVerification,
    verifyClientBOQ,
    rejectClientBOQ,
    getAllAcceptedClientBOQs,
    getClientBOQById
} = require('../../ProjectModule/controllers/clientBOQController');

const { verifyToken } = require('../../middlewares/requireAuth');

const router = express.Router();

// Creation Routes
router.post('/create', verifyToken, createClientBOQ);

// Verification Routes
router.get('/verification', verifyToken, getClientBOQsForVerification);
router.put('/verify/:id', verifyToken, verifyClientBOQ);
router.put('/reject/:id', verifyToken, rejectClientBOQ);

// General BOQ Routes
router.get('/accepted', verifyToken, getAllAcceptedClientBOQs);
router.get('/:id', verifyToken, getClientBOQById);

module.exports = router;