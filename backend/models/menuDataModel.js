const mongoose = require('mongoose')

const Schema = mongoose.Schema


const submenuItemsSchema = new Schema({
    title : String,
    path : String,
    group: String,
    groupId: Number,
    workflowname : String,
    workflowId:Number,
    pathId:Number,
    type:String,
    isCostCentreApplicable:{
        type:Boolean,
        default:false
    }
   


});

const menuDataDetailsSchema = new Schema({
    title:String,
    icon:String,
    submenu:Boolean,
    submenuItems:[submenuItemsSchema],
   
})

module.exports = mongoose.model('usermenudata', menuDataDetailsSchema)