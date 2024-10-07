const mongoose = require('mongoose')

const Schema = mongoose.Schema

const signatureAndRemarksSchema = new Schema({
    relatedEntityId :String,
    roleId:Number,
    levelId:Number,
    remarks:String,
    userId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'user'
    },
    userName:String
    
}, {timestamps:true})

module.exports = mongoose.model('signatureandremarks', signatureAndRemarksSchema)