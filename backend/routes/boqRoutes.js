const express = require('express')
const {
    createBOQ,
    updateBOQ,
    getBOQsForVerification,
    getAllBOQs,
    getAcceptedBOQs,
    rejectBOQ,
    getBOQById
} = require('../controllers/ProjectModule/boqUpdate')

const { 
    getAllChecklists,
    createChecklist,
    getChecklistById,
    addItemsToChecklist,
    updateChecklist,
    deleteChecklist
} = require('../controllers/ProjectModule/boqChecklist')

const { verifyToken } = require('../middlewares/requireAuth')
const { updateBOQRates, getBOQsForRevisionVerification, verifyBOQRevision, rejectBOQRevision, getPreviousRates, getAllRateHistory } = require('../controllers/ProjectModule/boqRevision')
const { createTenderFinalStatus, getTenderStatusForVerification, updateTenderStatus, rejectTenderStatus,getTenderForFinalStatus } = require('../ProjectModule/controllers/tenderFinalStatus')

const router = express.Router()

// BOQ Routes
router.post('/createboq', verifyToken, createBOQ)
router.get('/getboqforverification', verifyToken, getBOQsForVerification)
router.put('/updateboq/:id', verifyToken, updateBOQ)
router.put('/rejectboq/:id', verifyToken, rejectBOQ)
router.get('/getallboq', verifyToken, getAllBOQs)
router.get('/getoneboq/:id', verifyToken, getBOQById)


//BoQ checklist Routes
router.get('/checklists', getAllChecklists);
router.post('/checklists', createChecklist);
router.get('/checklists/:id', getChecklistById);
router.patch('/checklists/:id/items', addItemsToChecklist);
router.put('/checklists/:id', updateChecklist);
router.delete('/checklists/:id', deleteChecklist);

// BOQ Revision Routes
router.get('/getacceptedboq', verifyToken, getAcceptedBOQs)
router.put('/reviseboqrates/:id', verifyToken, updateBOQRates)
router.get('/boqrevisionforverification', verifyToken, getBOQsForRevisionVerification)
router.put('/verifyboqrevision/:id', verifyToken, verifyBOQRevision)
router.put('rejectboqrevision/:id', verifyToken, rejectBOQRevision)
router.get('/boqpreviousrates/:boqId', verifyToken, getPreviousRates);
router.get('/rate-history/:boqId', getAllRateHistory);

//Tender Final Status Routes
router.get('/get-tender-for-final-status', verifyToken, getTenderForFinalStatus);
router.post('/create-tender-status', verifyToken, createTenderFinalStatus);
router.get('/get-tender-status-verification', verifyToken, getTenderStatusForVerification);
router.put('/update-tender-status/:id', verifyToken, updateTenderStatus)
router.put('/reject-tender-status/:id', verifyToken, rejectTenderStatus);



module.exports = router