const express = require('express')
const {savePermission, getPermission, getPermissionRoleBase} = require('../controllers/permission')



const router = express.Router()


router.post('/rolepermissions', savePermission)

router.get('/rolepermissions', getPermission)

router.get('/rolepermissions/:roleId', getPermissionRoleBase)


module.exports = router