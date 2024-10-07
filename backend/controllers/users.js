const mongoose = require ('mongoose')
const bcrypt = require('bcrypt')
const Users = require('../models/usersModel')
const { getOneRole } = require('./userRoles')


//Get All Users 

const getAllUsers = async(req, res) =>{
    try {
        const user = await Users.find({}).sort({createdAt:-1})

        res.status(200).json(user)
        
    } catch (error) {

        res.status(400).json({error:error.message})
        
    }
}

//Get A Single User

const getSingleUser = async(req, res)=>{

    const {id} = req.params

    if(!mongoose.Types.ObjectId.isValid(id)){
        return res.status(400).json({
            error:'Invalid user'
        })
    }

    try {
        const user = await Users.findById(id)

        if(!user){
            return res.status(404).json({
                error:'Not found User'
            })
        }
        res.status(200).json(user)
        
        
    } catch (error) {
        console.error(error)
        res.status(500).json({error:'Internal server error '})
        
    }
}


//Create New User 

const createUser = async(req, res)=>{
    const {userName, email, roleId} = req.body

    try {

        const existingEmail = await Users.findOne({email})
        console.log('Existing email', existingEmail)

       
        if(existingEmail){
            return res.status(400).json({error:'User already exist '})
        }
        



        //generate random password
         const password = generateRandomPassword()
        

         // hash password 

         const hashedPassword = await bcrypt.hash(password, 10)

         // create user

         const user  = await Users.create({

            userName,
            email,
            password:hashedPassword,
            roleId,
            status:0


         });
         res.status(201).json({user, password})

    } catch (error) {

        console.log('Error Createing User', error)

        res.status(500).json({error:'An Error occured while creating user'})
        
    }
    
};

const generateRandomPassword =() =>{
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = ''
    for (let i= 0; i< 10; i++){
        password += characters.charAt(Math.floor(Math.random() * characters.length))
    }
    console.log(password)
    return password

   
};




//Update user

const updateUser = async(req, res)=>{
    const {id} = req.params

    if(!mongoose.Types.ObjectId.isValid(id)){
        return res.status(400).json({
            error:'No user available '
        })
    }
    const user = await Users.findByIdAndUpdate({_id:id},{
        ...req.body
    })

    if(!user){
        return res.status(400).json({error:'No such users'})
    }
    res.status(200).json(user)
}


//Remove User 

const deleteUser = async(req, res)=>{
    const {id} = req.params

    if(!mongoose.Types.ObjectId.isValid(id)){
        return res.status(400).json({
            error:"No such user"
        })
    }
    const user = await Users.findOneAndDelete({_id:id})

    if(!user){
        return res.status(400).json({error:'No User Found'})

    }
    res.status(200).json(user)

}


module.exports ={getAllUsers,
    createUser,
    updateUser,
    getSingleUser,
    deleteUser,
    updateUser
}