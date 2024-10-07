

const ccState = require('../models/stateModel')


const getAllState = async(req, res)=>{
    const locations = await ccState.find({})
    res.status(200).json(locations)
}


module.exports = {
    getAllState
}