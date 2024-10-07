
const mongoose = require('mongoose')

const UserRoles = require('../models/userRolesModel')


// Get All user Roles

const getAllUserRoles = async(req, res)=>{
   try {
    const roles = await UserRoles.find({}).sort({createdAt:-1})

    res.status(200).json(roles)
    
   } catch (error) {
    res.status(400).json({error:error.message})
   }
}

// Get a Single Role 

const getOneRole = async(req, res)=>{
    const {id} = req.params

    if(!mongoose.Types.ObjectId.isValid(id)){
        return res.status(400).json({
            error:'Invalid Id'
        })
    }
    try {
        const role = await UserRoles.findById(id)

        if(!role){
            return res.status(404).json({
                error:'Role Not Found'
            })
        }
        res.status(200).json(role)
        
    } catch (error) {
        console.error(error)
        res.status(500).json({error:'Internal server error '})
        
    }
}


//create New user Roles

const createNewUserRoles = async(req, res)=> {

    const {roleName, ccid =[], isCostCentreApplicable=false} = req.body

    try {

        //check role name already exist 
        const existingRoleName = await UserRoles.findOne({roleName})
        
        if(existingRoleName){
            return res.status(400).json({error:'Role name  already exists'})
            
            
        } 


        let costCentreTypes =[]
        if(isCostCentreApplicable){
            if(!ccid || ccid.length ===0){
                return res.status(400).json({error:'Cost Centre types are required  when cost centre is applicable'})
            }
            costCentreTypes = ccid.map(id => Number(id));
        }

        //create new role with data 

        const roles = await UserRoles.create({roleName,
            isCostCentreApplicable, 
            costCentreTypes})
        res.status(201).json(roles)
        
    } catch (error) {
        res.status(400).json({error:error.message})
        
        
    }
}



//Update User Roles

const updateUserRoles = async(req, res)=>{

    const {id} = req.params
    
    if(!mongoose.Types.ObjectId.isValid(id)){
        return res.status(400).json({
            error:'No Roles available with this name'
        })
    }
    const roles = await UserRoles.findByIdAndUpdate({_id:id},{
        ...req.body
    })

    if(!roles){
        return res.status(400).json({error:'No such roles'})
    }
    res.status(200).json(roles)
}


//Delete User Roles

const deleteUserRoles = async(req, res)=>{

    const {id} = req.params

    if(!mongoose.Types.ObjectId.isValid(id)){

        return res.status(400).json({
            error:'No Such Roles'
        })
    }
    const roles = await UserRoles.findOneAndDelete({_id:id})

    if(!roles){
        return res.status(400).json({error:'No Such role found'})
    }
    res.status(200).json(roles)
}

module.exports = {
    getAllUserRoles,
    createNewUserRoles,
    updateUserRoles,
    deleteUserRoles,
    getOneRole
}