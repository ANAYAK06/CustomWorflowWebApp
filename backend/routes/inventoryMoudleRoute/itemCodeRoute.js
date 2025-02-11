const express = require('express');
const {
    createBaseCode,
    getBaseCodesForVerification,
    verifyBaseCode,
    rejectBaseCode,
    createSpecification,
    getSpecificationsForVerification,
    verifySpecification,
    rejectSpecification,
    getAllBaseCodes,
    getBaseCodeById,
    getSpecificationsByBaseCode,
    getAllItemCodes,
    searchItemCodes,
    getDCACodesForItemCode,
    getSubDCACodesForDCA
} = require('../../InventoryModule/controller/itemCodeController');

const { verifyToken } = require('../../middlewares/requireAuth');

const router = express.Router();

// Base Code Routes
// ---------------
router.post('/base-code', verifyToken, createBaseCode);          // Handles both single and bulk creation
router.get('/base-code/verification', verifyToken, getBaseCodesForVerification);
router.post('/base-code/verify', verifyToken, verifyBaseCode);   // Handles both single and batch verification
router.post('/base-code/reject', verifyToken, rejectBaseCode);   // Handles both single and batch rejection
router.get('/base-codes', verifyToken, getAllBaseCodes);         // Get all base codes for dropdown
router.get('/base-code/:id', verifyToken, getBaseCodeById);      // Get base code details


// Specification Routes
// ------------------
router.post('/base-code/:itemCodeId/specification', verifyToken, createSpecification);  // Handles both single and bulk
router.get('/specification/verification', verifyToken, getSpecificationsForVerification);
router.post('/specification/verify', verifyToken, verifySpecification);  // Handles both single and bulk
router.post('/specification/reject', verifyToken, rejectSpecification);  // Handles both single and bulk
router.get('/base-code/:baseCodeId/specifications', verifyToken, getSpecificationsByBaseCode);  // Get all specs for a base code

// Search and Full Code Routes
// --------------------------
router.get('/full-codes', verifyToken, getAllItemCodes);         // Get all complete item codes
router.get('/search', verifyToken, searchItemCodes);             // Search functionality for indent creation

// get DCA Codes for Item Code

// In your routes file
router.get('/dca-for-itemcode',verifyToken, getDCACodesForItemCode);
router.get('/get-subdca-for-itemcode',verifyToken, getSubDCACodesForDCA);



module.exports = router;