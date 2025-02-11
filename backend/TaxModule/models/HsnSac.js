const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const hsnSacSchema = new Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true
    },
    type: {
        type: String,
        enum: ['HSN', 'SAC'],
        required: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    shortDescription: {
        type: String,
        trim: true
    },
    category: {
        type: String,
        required: true,
        trim: true
    },
    applicableType: {
        type: String,
        enum: ['MATERIAL', 'SERVICE', 'BOTH'],
        required: true
    },
    taxRateHistory: [{
        effectiveFrom: {
            type: Date,
            required: true
        },
        cgst: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        },
        sgst: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        },
        igst: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        },
        notification: {
            number: String,
            date: Date
        }
    }],
    status: {
        type: String,
        enum: ['Verification', 'Approved', 'Rejected'],
        default: 'Verification'
    },
   
}, {
    timestamps: true
});

// Indexes for better query performance
hsnSacSchema.index({ code: 1 });
hsnSacSchema.index({ status: 1 });
hsnSacSchema.index({ 'taxRateHistory.effectiveFrom': 1 });

// Method to get tax rates for a specific date
hsnSacSchema.methods.getTaxRatesForDate = function(invoiceDate) {
    const applicableRate = this.taxRateHistory
        .filter(rate => rate.effectiveFrom <= invoiceDate)
        .sort((a, b) => b.effectiveFrom - a.effectiveFrom)[0];
    
    return applicableRate || null;
};

// Virtual for current tax rates
hsnSacSchema.virtual('currentTaxRates').get(function() {
    return this.getTaxRatesForDate(new Date());
});

module.exports = mongoose.model('HsnSacCode', hsnSacSchema);