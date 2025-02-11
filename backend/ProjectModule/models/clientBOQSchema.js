const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const clientBOQSchema = new Schema({
    tenderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BOQ',
        required: true
    },
    sendToClientDate: {
        type: Date,
        required: true
    },
    attachments: [{
        filename: {
            type: String,
            required: true
        },
        filepath: {
            type: String,
            required: true
        }
       
    }],
    status: {
        type: String,
        enum: ['Verification', 'Approved', 'Rejected'],
        default: 'Verification'
    },
    levelId: {
        type: Number,
        default: 1
    },
   
    
}, {
    timestamps: true
});

// Add indexes for common queries
clientBOQSchema.index({ tenderId: 1 });
clientBOQSchema.index({ createdAt: -1 });
clientBOQSchema.index({ status: 1 });

module.exports = mongoose.model('ClientBOQ', clientBOQSchema);