const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Main tender final status schema
const tenderFinalStatusSchema = new Schema({
    boq: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BOQ',
        required: true,
        unique: true
    },
    tenderStatus: {
        type: String,
        enum: ['won', 'lost'],
        required: true
    },
    // Fields for lost tenders
    lostDetails: {
        L1: {
            companyName: String,
            price: Number,
            difference: Number // Difference from our quote
        },
        L2: {
            companyName: String,
            price: Number,
            difference: Number
        },
        winningParty: {
            name: String,
            details: String
        },
        reasonForLoss: {
            type: String,
            required: function() { return this.tenderStatus === 'lost'; }
        },
        futurePrecautions: {
            type: String,
            required: function() { return this.tenderStatus === 'lost'; }
        }
    },
    // Fields for won tenders with new financial details
    wonDetails: {
        tenderNumber: {
            type: String,
            required: function() { return this.tenderStatus === 'won'; }
        },
        // Optional PO Details
        poNumber: String,
        clientPODate: Date,
        workLocation: {
            type: String,
            required: function() { return this.tenderStatus === 'won'; }
        },
        expectedStartDate: {
            type: Date,
            required: function() { return this.tenderStatus === 'won'; }
        },
        // Financial Details
        originalBOQAmount: {
            type: Number,
            required: function() { return this.tenderStatus === 'won'; }
        },
        negotiatedAmount: {
            type: Number,
            required: function() { return this.tenderStatus === 'won'; }
        },
        originalVariationPercentage: {
            type: Number,
            required: function() { return this.tenderStatus === 'won'; },
            min: 0,
            max: 100
        },
        finalVariationPercentage: {
            type: Number,
            required: function() { return this.tenderStatus === 'won'; },
            min: 0,
            max: 100,
            validate: {
                validator: function(value) {
                    return value <= this.wonDetails.originalVariationPercentage;
                },
                message: 'Final variation percentage cannot exceed original variation percentage'
            }
        },
        finalVariationAmount: {
            type: Number,
            required: function() { return this.tenderStatus === 'won'; }
        },
        finalAcceptedAmount: {
            type: Number,
            required: function() { return this.tenderStatus === 'won'; }
        }
    },
    // Workflow fields
    levelId: {
        type: Number,
        default: 1
    },
    status: {
        type: String,
        enum: ['Verification', 'Approved', 'Rejected'],
        default: 'Verification'
    },
    remarks: String,
    // Optional Attachments
    attachments: [{
        name: String,
        path: String,
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

// Validate required fields based on tender status
tenderFinalStatusSchema.pre('validate', function(next) {
    if (this.tenderStatus === 'lost' && (!this.lostDetails || !this.lostDetails.reasonForLoss)) {
        next(new Error('Lost tender details are required'));
    } else if (this.tenderStatus === 'won' && (!this.wonDetails || !this.wonDetails.negotiatedAmount)) {
        next(new Error('Won tender details are required'));
    }
    next();
});

// Calculate differences for lost tenders and financial amounts for won tenders
tenderFinalStatusSchema.pre('save', async function(next) {
    if (this.tenderStatus === 'lost') {
        const boq = await mongoose.model('BOQ').findById(this.boq);
        if (boq) {
            if (this.lostDetails.L1?.price) {
                this.lostDetails.L1.difference = this.lostDetails.L1.price - boq.totalAmount;
            }
            if (this.lostDetails.L2?.price) {
                this.lostDetails.L2.difference = this.lostDetails.L2.price - boq.totalAmount;
            }
        }
    } else if (this.tenderStatus === 'won') {
        // Calculate variation amount and final accepted amount
        this.wonDetails.finalVariationAmount = 
            (this.wonDetails.negotiatedAmount * this.wonDetails.finalVariationPercentage) / 100;
        this.wonDetails.finalAcceptedAmount = 
            this.wonDetails.negotiatedAmount + this.wonDetails.finalVariationAmount;
    }
    next();
});

tenderFinalStatusSchema.pre('validate', function(next) {
    if (this.tenderStatus === 'won') {
        // Set default tender number if not provided
        if (!this.wonDetails.tenderNumber && this.boq) {
            this.wonDetails.tenderNumber = 
                this.boq.businessOpportunity?.tenderDetails?.tenderNumber ||
                this.boq.offerNumber;
        }
    }
    next();
});

module.exports = mongoose.model('TenderFinalStatus', tenderFinalStatusSchema);