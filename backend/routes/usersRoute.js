const express = require('express')

const {getAllUsers, createUser, getSingleUser, updateUser, deleteUser} = require('../controllers/users')

const router = express.Router()


// Get all Users 

router.get('/users', getAllUsers)

// Get single user 

router.get('/users/:id',getSingleUser)

// Create New users

router.post('/users', createUser)

// update User

router.patch('/users/:id', updateUser)

//Delete user

router.delete('/users/:id', deleteUser)




module.exports = router