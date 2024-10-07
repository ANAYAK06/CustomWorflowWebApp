const mongoose = require('mongoose')
const menuData = require('../models/menuModel')



const getMenu = async(req, res) =>{
    try {
        
        const menu = await menuData.find()
        res.status(200).json(menu)
    } catch (error) {
        res.status(400).json({error:error.message})
        
    }
}


module.exports = {getMenu}