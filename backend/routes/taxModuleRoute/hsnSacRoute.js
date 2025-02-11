
const express = require('express');
const {
    createHSNCode,
    getHSNForVerification,
    verifyHSNCode,
    rejectHSNCode,
    getAllApprovedHSN,
    editHSNCode,
    getHSNEditsForVerification,
    verifyHSNEdit,
    rejectHSNEdit
} = require('../../TaxModule/controller/hsnSac');

const { verifyToken } = require('../../middlewares/requireAuth');

const router = express.Router();

// HSN Creation Routes
router.post('/create', verifyToken, createHSNCode);
router.get('/verification', verifyToken, getHSNForVerification);
router.put('/verify/:id', verifyToken, verifyHSNCode);
router.put('/reject/:id', verifyToken, rejectHSNCode);
router.get('/approved', verifyToken, getAllApprovedHSN);

// HSN Edit Routes
router.put('/edit/:id', verifyToken, editHSNCode);
router.get('/edit/verification', verifyToken, getHSNEditsForVerification);
router.put('/edit/verify/:id', verifyToken, verifyHSNEdit);
router.put('/edit/reject/:id', verifyToken, rejectHSNEdit);

module.exports = router;