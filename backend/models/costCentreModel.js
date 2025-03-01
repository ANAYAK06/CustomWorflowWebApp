const mongoose = require('mongoose')


const Schema = mongoose.Schema

const costCentrerSchema = new Schema({
    ccType:{
        type:String,
        required:true
    },
    subCCType:{
        type:String,
        required:true
    },
    ccNo:{
        type:String,
        required:true,
        unique:true
    },
    ccName:{
        type:String,
        required:true,
        unique:true
    },
    location:{
        type:String,
        required:true    
    
    },
    address:{
        type:String

    },
    projectHandling:[
        {
            name:String,
            designation:String,
            phone:Number
        }
    ],
    client:[
        {
            name:String,
            address:String,
            phone:Number
        }
    ],
    contact:[
        {
            name:String,
            designation:String,
            phone:Number
        }

    ],
    finalOfferRef:[
        {
            finalOfferRef:String,
            finalOfferDate:Date

        }
    ],
    finalAcceptanceRef:[
        {
            finalAcceptanceRef:String,
            finalAcceptanceDate:Date

        }

    ],
    dayLimit:{
        type:Number,
        required:true,
        min:0
    },
    voucherLimit:{
        type:Number,
        required:true,
        min:0
    },
    levelId:{
        type:Number,
        default:1
    },
    status:{
        type:String,
        required:true,
        enum:['Rejected','Returned','Approved','Verification']
    },
    createdAt:{
        type:Date,
        default:Date.now
    }
    


})

module.exports = mongoose.model('CostCentre',costCentrerSchema)