// src/modules/inventory/models/HsnSac.js
const mongoose = require('mongoose');

const hsnSacHistorySchema = new mongoose.Schema({
    effectiveFrom: {
        type: Date,
        required: true
    },
    effectiveTo: Date,
    taxRates: {
        igst: {
            type: Number,
            required: true,
            min: 0,
            max: 100
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
        }
    }
}, {
    _id: true,
    timestamps: true
});

const hsnSacSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        validate: {
            validator: function(v) {
                // HSN codes are typically 4-8 digits
                // SAC codes are 6 digits
                return /^\d{4,8}$/.test(v);
            },
            message: props => `${props.value} is not a valid HSN/SAC code!`
        }
    },
    type: {
        type: String,
        enum: ['GOODS', 'SERVICES'],
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
    chapter: {
        type: String,
        required: true,
        trim: true,
        // Chapter numbers are typically 2 digits
        validate: {
            validator: function(v) {
                return /^\d{2}$/.test(v);
            },
            message: props => `${props.value} is not a valid chapter number!`
        }
    },
    section: {
        type: String,
        required: true,
        trim: true
    },
    currentTaxRates: {
        igst: {
            type: Number,
            required: true,
            min: 0,
            max: 100
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
        }
    },
    taxHistory: [hsnSacHistorySchema],
    active: {
        type: Boolean,
        default: true
    },
    isRestricted: {
        type: Boolean,
        default: false
    },
    notes: {
        type: String,
        trim: true
    },
    exemptionText: {
        type: String,
        trim: true
    },
    applicableForTypes: [{
        type: String,
        enum: ['MATERIAL', 'SERVICE', 'BOTH']
    }],
    validationRules: {
        requiresAdditionalDocs: {
            type: Boolean,
            default: false
        },
        requiredDocuments: [String],
        specialConditions: [String]
    }
}, {
    timestamps: true,
    collection: 'hsnsac'
});

// Indexes
hsnSacSchema.index({ code: 1 }, { unique: true });
hsnSacSchema.index({ chapter: 1 });
hsnSacSchema.index({ type: 1 });
hsnSacSchema.index({ 'currentTaxRates.igst': 1 });

// Virtual for full tax rate
hsnSacSchema.virtual('totalTaxRate').get(function() {
    return this.currentTaxRates.igst;
});

// Methods
hsnSacSchema.methods = {
    // Get tax rates for a specific date
    async getTaxRatesForDate(date) {
        const effectiveRates = this.taxHistory.find(history => {
            const startDate = new Date(history.effectiveFrom);
            const endDate = history.effectiveTo ? new Date(history.effectiveTo) : new Date();
            return date >= startDate && date <= endDate;
        });

        return effectiveRates ? effectiveRates.taxRates : this.currentTaxRates;
    },

    // Add new tax rates
    async addTaxRates(newRates, effectiveFrom) {
        // If there are existing rates, set their effectiveTo
        const currentRates = this.taxHistory[this.taxHistory.length - 1];
        if (currentRates) {
            currentRates.effectiveTo = new Date(effectiveFrom);
        }

        // Add new rates to history
        this.taxHistory.push({
            effectiveFrom: new Date(effectiveFrom),
            taxRates: { ...newRates }
        });

        // Update current rates
        this.currentTaxRates = { ...newRates };
        
        return this.save();
    }
};

// Static methods
hsnSacSchema.statics = {
    // Find by code with tax history
    async findByCodeWithHistory(code) {
        return this.findOne({ code }).sort({ 'taxHistory.effectiveFrom': -1 });
    },

    // Get all active codes for a type
    async getActiveByType(type) {
        return this.find({ type, active: true })
                  .select('code description currentTaxRates')
                  .sort('code');
    },

    // Search by code or description
    async search(query) {
        return this.find({
            $or: [
                { code: new RegExp(query, 'i') },
                { description: new RegExp(query, 'i') }
            ],
            active: true
        }).limit(10);
    }
};

// Middleware
hsnSacSchema.pre('save', function(next) {
    // Validate CGST and SGST are half of IGST
    if (this.currentTaxRates.igst !== (this.currentTaxRates.cgst + this.currentTaxRates.sgst) * 2) {
        next(new Error('CGST + SGST must equal IGST'));
        return;
    }
    next();
});

module.exports = mongoose.model('HsnSac', hsnSacSchema);

// Constants for HSN/SAC
const HSN_SAC_CONSTANTS = {
    TYPES: {
        GOODS: 'GOODS',
        SERVICES: 'SERVICES'
    },
    APPLICABLE_TYPES: {
        MATERIAL: 'MATERIAL',
        SERVICE: 'SERVICE',
        BOTH: 'BOTH'
    }
};