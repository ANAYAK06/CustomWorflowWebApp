const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const User = require('../models/usersModel')
const userRoles = require('../models/userRolesModel')
const {generateToken} = require('../middlewares/requireAuth')


// login


const login = async(req, res) =>{

    try {

        //extract email and password from request body

        const {email, password} = req.body;

        // user exist in db
        const user = await User.findOne({email})

        if(!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({message:'Invalid Email or Password'})
        }
        //check if user is active
        if(user.status !== 1){
            return res.status(401).json({message:'User is inactive'})
        }
       

        //Generate token

        const token = generateToken(user)

        const userRole = await userRoles.findOne({roleId:user.roleId})
        const userData = {
            userName : user.userName,
            roleName: userRole ? userRole.roleName: 'Unknown Role',
            roleId:user.roleId
            
            

        }

        // Return Token

        res.json({token, user:userData});

        
    } catch (error) {
        console.error('Error occured while login', error);
        res.status(500).json({message:'Server Error'})
        
    }


};

module.exports = {login}