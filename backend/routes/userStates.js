const express = require('express')

const {getAllState} = require('../controllers/ccState')



const router = express.Router()



// Get all Users States

router.get('/countrystate', getAllState)


module.exports = router