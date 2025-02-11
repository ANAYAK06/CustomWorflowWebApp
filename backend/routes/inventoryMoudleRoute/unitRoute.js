


const express = require('express');
const {
    createUnit,
    getAllUnits,
    getUnitsForVerification,
    updateUnitStatus,
    rejectUnit,
    bulkUploadUnits,
    getUnitById,
    updateUnit,
    updateConversion,
    getUnitsByType,
    getUnitConversions,
    getUnitHistory
} = require('../../InventoryModule/controller/unitController');

const { verifyToken } = require('../../middlewares/requireAuth');

const router = express.Router();

// Unit Creation and Bulk Upload Routes
router.post('/create', verifyToken, createUnit);
router.post('/bulk-upload', verifyToken, bulkUploadUnits);

// Verification Routes
router.get('/verification', verifyToken, getUnitsForVerification);
router.put('/verify/:id', verifyToken, updateUnitStatus);
router.put('/verify/batch/:batchId', verifyToken, updateUnitStatus);
router.put('/reject/:id', verifyToken, rejectUnit);
router.put('/reject/batch/:batchId', verifyToken, rejectUnit);

// General Unit Routes
router.get('/', verifyToken, getAllUnits);
router.get('/units/type/:type', verifyToken, getUnitsByType);
router.get('/:id', verifyToken, getUnitById);
router.get('/:id/history', verifyToken, getUnitHistory);
router.put('/:id', verifyToken, updateUnit);

// Conversion Routes
router.post('/conversion', verifyToken, updateConversion);
router.get('/conversion/:unitSymbol', verifyToken, getUnitConversions);

module.exports = router;