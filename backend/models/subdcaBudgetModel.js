const mongoose = require('mongoose');

const subDcaBudgetSchema = new mongoose.Schema({
    ccNo: {
        type: String,
        required: true
    },
    dcaCode: {
        type: String,
        required: true
    },
    subDcaCode: {
        type: String,
        required: true
    },
    assignedBudget: {
        type: Number,
        required: true
    },
    consumedBudget: {
        type: Number,
        default: 0
    },
    balanceBudget: {
        type: Number,
        required: true
    },
    fiscalYear: {
        type: String,
        required: function() { return this.applyFiscalYear; }
    },
    applyFiscalYear: {
        type: Boolean,
        default: false
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
  
}, { timestamps: true });

module.exports = mongoose.model('SubDCABudget', subDcaBudgetSchema);