
const mongoose = require('mongoose');
const serviceRateSchema = new mongoose.Schema({
    itemCode: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ItemCode',
        required: true
    },
    unit: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Unit',
        required: true
    },
    rate: {
        type: Number,
        required: true,
        min: 0
    },
    minimumCharge: {
        type: Number,
        min: 0
    },
    minimumQuantity: {
        type: Number,
        min: 0
    },
    effectiveFrom: {
        type: Date,
        required: true
    },
    effectiveTo: Date,
    conditions: [String],
    active: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});


module.exports = mongoose.model('ServiceRate', serviceRateSchema)