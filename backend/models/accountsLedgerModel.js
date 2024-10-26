const mongoose = require('mongoose')
const {setBalanceType} = require ('../hooks/accountsLedgerHelper')

const Schema = mongoose.Schema

const accountsLedgerSchema = new Schema({
    ledgerId:{
        type:mongoose.Schema.Types.ObjectId,
        auto:true
    },
    ledgerName:{
        type:String,
        required:true,
        unique:true
    },
    groupId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'accountgroup',
        required:true
    },
    isTDSApplicable:{
        type:Boolean,
        default:false
    },
    isTCSApplicable:{
        type:Boolean,
        default:false
    },
    isGSTApplicable:{
        type:Boolean,
        default:false
    },
    openingBalance:{
        type:Number,
        default:0
    },
    balanceType:{
        type:String,
        enum:['Dr' ,'Cr'],
        required:true
    },
    balanceAsOn:{
        type:Date
    },
    levelId: {
        type: Number,
        default: 1
    },
    status: {
        type: String,
        required: true,
        enum: ['Rejected', 'Returned', 'Approved', 'Verification']
    },
  

},{ timestamps: true })

accountsLedgerSchema.pre('save', async function(next){
    try {
        if(!this.balanceType){
            this.balanceType = await setBalanceType(this.groupId)
        }
        next()
    } catch (error) {
        
        next(error)
    }
}

)

module.exports = mongoose.model('accountLedger', accountsLedgerSchema)