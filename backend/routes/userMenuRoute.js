const express = require('express')

const {getUserMenu, getRoleMenu} = require('../controllers/userMenu')

const router = express.Router()


//getUserMenu Data

router.get('/getusermenu', getUserMenu)

router.get('/getrolemenu', getRoleMenu)






module.exports = router