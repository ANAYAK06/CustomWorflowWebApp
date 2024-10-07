const express = require('express')

const {login} = require('../controllers/login')
const {verifyToken} = require('../middlewares/requireAuth')


const router = express.Router()

//User Login

router.post('/userlogin', login)

router.get('/protectedRoute', verifyToken, (req, res )=>{
    res.json({message:'this is protected '})
})



module.exports = router