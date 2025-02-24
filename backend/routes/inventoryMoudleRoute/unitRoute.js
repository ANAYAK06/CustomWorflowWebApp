


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
    getUnitHistory,
    getUnitsByCategory,
    getAllowedUnitsByBaseCode
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
router.put('/reject', verifyToken, rejectUnit);


// General Unit Routes
router.get('/', verifyToken, getAllUnits);
router.get('/units/type/:type', verifyToken, getUnitsByType);
router.get('/:id', verifyToken, getUnitById);
router.get('/:id/history', verifyToken, getUnitHistory);
router.put('/:id', verifyToken, updateUnit);
router.get('/unit/:category', verifyToken, getUnitsByCategory);

// Conversion Routes
router.post('/conversion', verifyToken, updateConversion);
router.get('/conversion/:unitSymbol', verifyToken, getUnitConversions);

// Allowed Unit for an item

router.get('/allowed/:primaryUnit', verifyToken, getAllowedUnitsByBaseCode)

module.exports = router;