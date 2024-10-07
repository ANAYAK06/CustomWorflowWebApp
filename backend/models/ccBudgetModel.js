const mongoose = require('mongoose')



const Schema = mongoose.Schema

const ccBudgetSchema = new Schema({

    ccid: { type: Number, required: true },
    subId: { type: Number, required: true },
    ccNo: { type: String, required: true, ref: 'costcentre' },
    ccBudget: { type: Number, required: true, min: 0 },
    applyFiscalYear: {type:Boolean, default:false},
    fiscalYear: { type: String },
    budgetBalance: { type: Number, required:true },
    transferredFromPreviousYear:{type:Boolean, default:false},
    levelId:{
        type:Number,
        default:1
    },
    status:{
        type:String,
        required:true,
        enum:['Rejected','Returned','Approved','Verification']
    },

})




module.exports = mongoose.model('ccbudget', ccBudgetSchema)