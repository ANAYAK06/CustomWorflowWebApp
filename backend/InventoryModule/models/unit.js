const mongoose = require('mongoose');
const { UNIT_TYPES } = require('../constants/unitConstants');


const unitSchema = new mongoose.Schema({
    creationType: {
        type: String,
        enum: ['SINGLE', 'BULK'],
        required: true
    },
    batchId: {
        type: String,  // For grouping bulk uploaded units
        required: false},
    name: { 
        type: String, 
        required: true,
        unique: true,
        uppercase: true
    },
    symbol: {
        type: String,
        required: true,
        unique: true
    },
    type: {
        type: String,
        enum: Object.values(UNIT_TYPES),
        required: true
    },
    baseUnit: {
        type: Boolean,
        default: false
    },
    applicableTypes: [{
        type: String,
        enum: ['MATERIAL', 'SERVICE', 'BOTH']
    }],
    serviceCategory: [{
        type: String,
        enum: ['TIME_BASED', 'QUANTITY_BASED', 'DISTANCE_BASED', 'AREA_BASED', 'VOLUME_BASED', 'LUMPSUM']
    }],
    conversions: [{
        toUnit: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Unit'
        },
        factor: Number
    }],
    active: {
        type: Boolean,
        default: true
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
}, {
    timestamps: true
});

module.exports = mongoose.model('Unit', unitSchema);