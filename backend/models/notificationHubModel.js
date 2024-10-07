const mongoose = require('mongoose')


const Schema = mongoose.Schema

const notificationhubSchema = new  Schema({
    workflowId :Number,
    roleId:Number,
    pathId:Number,
    levelId:Number,
    relatedEntityId:String,
    message:String,
    status:String,
    isCostCentreBased:Boolean,
    ccCode:String

})

module.exports = mongoose.model('notification', notificationhubSchema)