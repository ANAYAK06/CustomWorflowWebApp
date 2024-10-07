const express = require('express')

const { getMenu } = require('../controllers/menu')

const router = express.Router()

//getmenu

router.get('/usermenu', getMenu)













module.exports = router