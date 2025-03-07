const express = require('express')
const {savePermission, getPermission, getPermissionRoleBase, getPermissionById, createPermission, updatePermission, deletePermission} = require('../controllers/permission')
const { getPendingWorkflows, canDeleteWorkflow } = require('../controllers/pendingNotification')



const router = express.Router()


router.post('/rolepermissions', savePermission)

router.get('/rolepermissions', getPermission)
router.get('/rolepermissions/:id', getPermissionById)

router.get('/rolepermissions/:roleId', getPermissionRoleBase)
router.post('/rolepermissions/create', createPermission);
router.put('/rolepermissions/:id', updatePermission);
router.delete('/rolepermissions/:id', deletePermission);

router.get('/pending-workflows/:id', getPendingWorkflows);

// Check if a workflow can be deleted
router.get('/can-delete-workflow/:id', canDeleteWorkflow);



module.exports = router