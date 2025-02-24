const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const clientPOSchema = new Schema({
    poNumber: {
        type: String,
        required: true,
        unique: true
    },
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true
    },
    subClientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubClient'
    },
    boqId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BOQ',
        required: true
    },
    items: [{
        boqItemId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        description: String,
        quantity: Number,
        rate: Number,
        totalValue: Number,
        itemTypes: [{
            type: String,
            enum: ['Supply', 'Service', 'Manufacturing']
        }],
        isSublet: Boolean
    }],
    costCentreId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CostCentre',
        required: true
    },
    advanceApplicable: {
        isApplicable: Boolean,
        percentage: Number
    },
    billingPlan: {
        type: String,
        enum: ['Monthly', 'Quarterly', 'Completion_Based', 'Custom'],
        required: true
    },
    billingPlanDetails: {
        completionPercentages: [Number],
        customDates: [Date]
    },
    budgetAllocation: {
        method: {
            type: String,
            enum: ['PO_Value', 'Invoice_Value'],
            required: true
        },
        percentage: {
            type: Number,
            required: true
        }
    },
    status: {
        type: String,
        required: true,
        enum: ['Rejected', 'Returned', 'Approved', 'Verification'],
        default: 'Verification'
    },
    levelId: {
        type: Number,
        default: 1
    },
    ClientPOStatus: {
        type: String,
        enum: ['Draft', 'InProgress', 'Approved', 'Under Amendment'],
        default: 'Draft'
    },
    remarks: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('ClientPO', clientPOSchema);