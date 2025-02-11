const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const boqRateHistorySchema = new Schema({
    boqId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BOQ',
        required: true
    },
    itemCode: {
        type: String,
        required: true
    },
    rates: [{
        rate: {
            type: Number,
            required: true
        },
        revisionNumber: {
            type: Number,
            required: true
        }
    }]
}, {
    timestamps: true
});

// Index for efficient querying
boqRateHistorySchema.index({ boqId: 1, itemCode: 1 }, { unique: true });

module.exports = mongoose.model('BOQRateHistory', boqRateHistorySchema);