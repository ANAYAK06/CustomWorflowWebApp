
const CostCentreType = require('../models/costCentreTypeModel')
const mongoose = require('mongoose')


// Get All Cost Centre Types

const getAllCostCentreType = async(req, res)=>{

    const ccType = await CostCentreType.find({}).sort({createdAt: -1})

    res.status(200).json(ccType)
}

//Create new Cost Centre Type

const newCostCentreType = async(req, res) =>{

    const {ccType, ccid} = req.body

    try {
        const cctypes = await CostCentreType.create({ccType,ccid})
        res.status(200).json(cctypes)
        
    } catch (error) {

        res.status(400).json({error:error.message})
        
    }
}

module.exports = {

    getAllCostCentreType,
    newCostCentreType
}