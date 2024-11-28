const express = require('express')
const {
    createBOQ,
    updateBOQ,
    getBOQsForVerification,
    getAllBOQs,
    getAcceptedBOQs,
    rejectBOQ
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

const router = express.Router()

// BOQ Routes
router.post('/createboq', verifyToken, createBOQ)
router.get('/getboqforverification', verifyToken, getBOQsForVerification)
router.put('/updateboq/:id', verifyToken, updateBOQ)
router.put('/rejectboq/:id', verifyToken, rejectBOQ)
router.get('/getallboq', verifyToken, getAllBOQs)
router.get('/getacceptedboq', verifyToken, getAcceptedBOQs)

// Routes
router.get('/checklists', getAllChecklists);
router.post('/checklists', createChecklist);
router.get('/checklists/:id', getChecklistById);
router.patch('/checklists/:id/items', addItemsToChecklist);
router.put('/checklists/:id', updateChecklist);
router.delete('/checklists/:id', deleteChecklist);

module.exports = router