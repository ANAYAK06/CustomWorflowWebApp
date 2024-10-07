const express = require('express')

const {getAllUserRoles, createNewUserRoles,updateUserRoles,deleteUserRoles, getOneRole} = require('../controllers/userRoles')

const router = express.Router()

//Get All user roles

router.get('/useroles',getAllUserRoles)

// Get one role

router.get('/useroles/:id',getOneRole)
//update user roles

router.patch('/useroles/:id',updateUserRoles)

//create new user roles

router.post('/useroles',createNewUserRoles)

//delete user roles

router.delete('/useroles/:id',deleteUserRoles)




module.exports = router