const mongoose = require('mongoose');
const Unit = require('../models/unit');



const priceReferenceSchema = new mongoose.Schema({
    partyName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    price: { type: Number, required: true },
    websiteUrl: String,
    date: { type: Date, default: Date.now }
});



const specificationSchema = new mongoose.Schema({

    baseCodeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ItemCode',
        required: true
    },
    baseCode: {
        type: String,
        required: true
    },

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

module.exports = mongoose.model('SpecificationCode', specificationSchema);