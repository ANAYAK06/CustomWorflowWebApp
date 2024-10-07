const mongoose = require('mongoose')

const Schema = mongoose.Schema

const accountGroupsSchema = new Schema({
    groupId: {
        type: Number,
        required: true,
        unique: true
    },
    groupName: {
        type: String,
        required: true
    },
    groupUnder:{
        type:String,
        required:true,
        ref:'accountgroup'
    },
    natureId: {
        type: Number,
        required: true,
        ref: 'accountsnature'
    },
    affectsGrossProfit: {
        type: Boolean,
        default: false
    },
    reportIndex: {
        type: Number,
        required: true
    },
    reportType: {
        type: String,
        enum: ['PL', 'BS'],
        required: true
    },
    isBuiltIn:{
        type:Boolean,
        default:false
    }
})

module.exports = mongoose.model('accountgroup', accountGroupsSchema)