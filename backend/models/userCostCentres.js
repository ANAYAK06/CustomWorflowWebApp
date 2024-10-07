const mongoose = require('mongoose')


const Schema = mongoose.Schema

const userCostCentreSchema = new Schema({
    userId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'Users',
        required:true
    },
    roleId:{
        type:Number,
        ref:'UserRoles',
        required:true

    },
        costCentreId:[ {
            type:String,
            ref:'costcentre'
        }],
    assignedAt:{
        type:Date,
        default:Date.now
    }
})

module.exports = mongoose.model('UserCostCentre', userCostCentreSchema)