const mongoose = require('mongoose');
const Unit = require('../models/unit');
const { MATERIAL_CATEGORIES, MATERIAL_MAJOR_GROUPS, ASSET_CATEGORIES } = require('../constants/materialConstants');
const { SERVICE_CATEGORIES, SERVICE_MAJOR_GROUPS } = require('../constants/serviceConstants');
const { UnitConversionService } = require('../services/unitConversionService');

const priceReferenceSchema = new mongoose.Schema({
    partyName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    price: { type: Number, required: true },
    websiteUrl: String,
    date: { type: Date, default: Date.now }
});

const priceConversionSchema = new mongoose.Schema({
    unit: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Unit',
        required: true
    },
    rate: {
        type: Number,
        required: true,
        min: 0
    }
});

const specificationSchema = new mongoose.Schema({
    scode: {
        type: String,
        required: true
    },
    fullCode: {
        type: String,
        required: true
    },
    make: {
        type: String,
        required: true,
        trim: true
    },
    specification: {
        type: String,
        trim: true
    },
    primaryUnit: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Unit',
        required: true
    },
    allowedUnits: [{
        unit: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Unit'
        },
        isDefault: {
            type: Boolean,
            default: false
        }
    }],
    standardPrice: {
        type: Number,
        required: true,
        min: 0
    },
    priceConversions: [priceConversionSchema],
    priceReferences: [priceReferenceSchema],
    active: {
        type: Boolean,
        default: true
    },
    remarks: String,
    status: {
        type: String,
        enum: ['Verification', 'Approved', 'Rejected'],
        default: 'Verification'
    },
    levelId: {
        type: Number,
        default: 1
    }
});

// Pre-save middleware for specifications to validate and calculate unit conversions
specificationSchema.pre('save', async function(next) {
    try {
        // Validate primary unit exists in allowed units
        const primaryUnitExists = this.allowedUnits.some(
            au => au.unit.toString() === this.primaryUnit.toString()
        );
        if (!primaryUnitExists) {
            this.allowedUnits.push({
                unit: this.primaryUnit,
                isDefault: true
            });
        }

        // If priceConversions are provided, validate and calculate rates
        if (this.priceConversions.length > 0) {
            const primaryUnit = await Unit.findById(this.primaryUnit);
            
            // Validate all units are in allowedUnits
            for (const conversion of this.priceConversions) {
                const isAllowed = this.allowedUnits.some(
                    au => au.unit.toString() === conversion.unit.toString()
                );
                if (!isAllowed) {
                    throw new Error('Price conversion unit must be in allowed units');
                }

                // Get the target unit
                const targetUnit = await Unit.findById(conversion.unit);
                if (!primaryUnit || !targetUnit) {
                    throw new Error('Invalid unit reference');
                }

                // Calculate conversion rate using UnitConversionService
                const conversionFactor = await UnitConversionService.convert(
                    1,
                    primaryUnit.symbol,
                    targetUnit.symbol
                );

                // Set the converted price rate
                conversion.rate = this.standardPrice * conversionFactor;
            }
        }

        next();
    } catch (error) {
        next(error);
    }
});

const itemCodeSchema = new mongoose.Schema({
     uploadBatch: {
        type: mongoose.Schema.Types.ObjectId,
        index: true
    },
    baseCode: {
        type: String,
        required: true,
        unique: true
    },
    type: {
        type: String,
        enum: ['MATERIAL', 'SERVICE'],
        required: true
    },
    categoryCode: {
        type: String,
        required: true
    },
    isAsset: {
        type: Boolean,
        required: true,
        default: false
    },
    assetCategory: {
        type: String,
        values: ASSET_CATEGORIES,
        messge:'{VALUE} is not a valid asset category',
        required: function() {
            return this.isAsset === true;
        },
        validate: {
            validator: function(value) {
                // Skip validation if not an asset
                if (!this.isAsset) {
                    return true;
                }
                // Validate if it is an asset
                return ASSET_CATEGORIES.includes(value);
            },
            message: 'Asset category is required when item is marked as asset'
        }
    },
    majorGroupCode: {
        type: String,
        required: true
    },
    nameCode: {
        type: String,
        required: true,
        minlength: 2,
        maxlength: 2
    },
    itemName: {
        type: String,
        required: true,
        trim: true
    },
    hsnSac: {
        type: String,
        ref: 'HsnSac',
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
    primaryUnit: { 
        type:String,
        required: true
    },
    status: {
        type: String,
        enum: ['Verification', 'Approved', 'Rejected'],
        default: 'Verification'
    },
    levelId: {
        type: Number,
        default: 1
    },
    active: {
        type: Boolean,
        default: true
    },
    remarks: String,
    specifications: [specificationSchema]
}, {
    timestamps: true
});




module.exports = mongoose.model('ItemCode', itemCodeSchema);
