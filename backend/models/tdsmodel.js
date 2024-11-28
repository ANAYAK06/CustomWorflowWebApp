const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const tdsSchema = new Schema({
    taxType: {
        type: String,
        required: true,
        default: 'tds'
    },
    tdsAccountName: {
        type: String,
        required: true,
        trim: true
    },
    tdsAccountSec: {
        type: String,
        required: true,
        trim: true
    },
    accountingGroupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'accountgroup',
        required: true,
        validate: {
            validator: async function(value) {
                try {
                    const accountGroup = await mongoose.model('accountgroup').findById(value);
                    return accountGroup !== null;
                } catch (error) {
                    return false;
                }
            },
            message: props => `${props.value} is not a valid accounting group ID`
        }
    },
    openingBalance: {
        type: Number,
        required: true,
        default: 0
    },
    openingBalanceAsOn: {
        type: Date,
        required: true,
        default: Date.now
    },
    taxRules: {
        individual: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        },
        huf: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        },
        companiesAndFirms: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        },
        others: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        }
    },
    levelId: {
        type: Number,
        default: 1
    },
    status: {
        type: String,
        required: true,
        enum: ['Rejected', 'Returned', 'Approved', 'Verification'],
        default: 'Verification'
    },
   
}, {
    timestamps: true,
    
});

// Indexes for better query performance
tdsSchema.index({ tdsAccountName: 1 });
tdsSchema.index({ status: 1 });
tdsSchema.index({ createdBy: 1 });
tdsSchema.index({ accountingGroupId: 1 });

const TDS = mongoose.model('TDS', tdsSchema);

module.exports = TDS;