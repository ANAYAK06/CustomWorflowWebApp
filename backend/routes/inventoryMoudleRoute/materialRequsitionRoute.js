const express = require('express');
const { 
    createMaterialRequisition, 
    getMaterialRequisitionsForVerification, 
    updateMaterialRequisitionStatus, 
    rejectMaterialRequisition, 
    searchItemsByQuery
} = require('../../InventoryModule/controller/materialRequisitionController');
const { verifyToken } = require('../../middlewares/requireAuth');

const router = express.Router();

// Create material requisition
router.post('/material-requisition/create', verifyToken, createMaterialRequisition);

// Get requisitions for verification (supports ?type=batch for batch grouping)
router.get('/material-requisition/verification', verifyToken, getMaterialRequisitionsForVerification); 

// Update/verify requisition - separate routes for individual and batch
router.put('/material-requisition/verify/:id', verifyToken, updateMaterialRequisitionStatus); // For single item
router.put('/material-requisition/verify/batch/:batchId', verifyToken, updateMaterialRequisitionStatus); // For batch

// Reject requisition - your controller expects id/batchId in the request body, not params
router.post('/material-requisition/reject', verifyToken, rejectMaterialRequisition);

router.get('/material/search-items', verifyToken, searchItemsByQuery);

module.exports = router;