const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Client sub-schema for better organization
const clientSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    contactPerson: {
        type: String,
        required: true,
        trim: true
    },
    phone: {
        type: String,
        required: true,
        match: [/^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s\./0-9]*$/, 'Please enter a valid phone number']
    },
    email: {
        type: String,
        required: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
        trim: true,
        lowercase: true
    },
    address: {
        type: String,
        required: true,
        trim: true
    }
});

// Joint Venture Details sub-schema
const jointVentureSchema = new Schema({
    companyName: {
        type: String,
        required: true,
        trim: true
    },
    registrationNumber: {
        type: String,
        required: true,
        trim: true
    },
    sharePercentage: {
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
    contactPerson: {
        type: String,
        required: true,
        trim: true
    },
    isFrontParty: {
        type: Boolean,
        default: false
    },
    contactEmail: {
        type: String,
        required: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
        trim: true,
        lowercase: true
    },
    contactPhone: {
        type: String,
        required: true,
        match: [/^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s\./0-9]*$/, 'Please enter a valid phone number']
    }
});

// EMD Details sub-schema
const emdSchema = new Schema({
    amount: {
        type: Number,
        min: 0,
        required: true
    },
    type: {
        type: String,
        enum: ['BG', 'DD'],
        required: true
    }
});

// Main Business Opportunity Schema
const businessOpportunitySchema = new Schema({
    opportunityNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    type: {
        type: String,
        enum: ['TENDER', 'PROPOSAL'],
        required: true,
        uppercase: true
    },
    descriptionOfWork: {
        type: String,
        required: true,
        trim: true,
        minLength: [10, 'Description of work must be at least 10 characters long']
    },
    submissionDate: {
        type: Date,
        required: true
    },
    client: {
        type: clientSchema,
        required: true
    },
    ultimateCustomer: {
        name: {
            type: String,
            required: function() {
                return this.type === 'TENDER';
            },
            trim: true
        },
        industry: {
            type: String,
            trim: true
        },
        sector: {
            type: String,
            enum: ['PUBLIC', 'PRIVATE', 'GOVERNMENT'],
            required: function() {
                return this.type === 'TENDER';
            }
        }
    },
    opportunityType: {
        type: String,
        enum: ['EPC', 'ETC', 'MANUFACTURING', 'TRADING', 'SERVICES'],
        required: true
    },
    businessCategory: {
        type: String,
        enum: ['E&I', 'HVSS', 'CIVIL', 'O&M', 'WU', 'MECH'],
        required: true
    },
    estimatedValue: {
        type: Number,
        required: true,
        min: 0
    },
    tenderDetails: {
        tenderNumber: {
            type: String,
            required: function() {
                return this.type === 'TENDER';
            },
            trim: true
        },
        tenderDate: {
            type: Date,
            required: function() {
                return this.type === 'TENDER';
            }
        },
        emdRequired: {
            type: Boolean,
            default: false
        },
        emdDetails: {
            type: emdSchema,
            required: function() {
                return this.tenderDetails && this.tenderDetails.emdRequired === true;
            }
        }
    },
    jointVentureAcceptable: {
        type: Boolean,
        default: false
    },
    jointVentureDetails: {
        type: [jointVentureSchema],
        required: function() {
            return this.jointVentureAcceptable === true ;
        },
        default:undefined
    },
    requestStatus: {
        type: String,
        enum: ['Accepted', 'Rejected', 'Submitted','BOQDrafted'],
        required: true,
        default: 'Submitted'
    },
    levelId: {
        type: Number,
        default: 1,
        min: 1
    },
    status: {
        type: String,
        enum: ['Rejected', 'Returned', 'Approved', 'Verification'],
        required: true,
        default: 'Verification'
    }
}, {
    timestamps: true
});

// Indexes
// Add this to your schema
businessOpportunitySchema.index({ opportunityNumber: 1 }, { unique: true });
businessOpportunitySchema.index({ type: 1, 'client.name': 1 });
businessOpportunitySchema.index({ submissionDate: 1 });
businessOpportunitySchema.index({ 'ultimateCustomer.name': 1 });

// Pre-save middleware to generate opportunity number
// In your BusinessOpportunity schema
businessOpportunitySchema.pre('save', async function(next) {
    try {
        if (!this.opportunityNumber) {
            const currentYear = new Date().getFullYear();
            
            // Find the highest serial number for the current year
            const lastOpportunity = await this.constructor.findOne({
                opportunityNumber: new RegExp(`EPPL/${currentYear}/`)
            }, {
                opportunityNumber: 1
            }).sort({
                opportunityNumber: -1
            });
            
            let nextSerial = '0001';
            
            if (lastOpportunity) {
                const lastSerial = lastOpportunity.opportunityNumber.split('/')[2];
                nextSerial = (parseInt(lastSerial) + 1).toString().padStart(4, '0');
            }
            
            this.opportunityNumber = `EPPL/${currentYear}/${nextSerial}`;
        }
        next();
    } catch (error) {
        next(error);
    }
});

// Validation middleware
businessOpportunitySchema.pre('validate', function(next) {
    // Validate EMD details if emdRequired is true
    if (this.tenderDetails && this.tenderDetails.emdRequired && !this.tenderDetails.emdDetails) {
        next(new Error('EMD details are required when EMD is required'));
    }
    
    // Validate tender details if type is TENDER
    if (this.type === 'TENDER' && (!this.tenderDetails || !this.tenderDetails.tenderNumber)) {
        next(new Error('Tender details are required for TENDER type opportunities'));
    }
    
    // Validate joint venture details if joint venture is acceptable and status is submitted
    if (this.jointVentureAcceptable && this.requestStatus === 'Submitted' && !this.jointVentureDetails) {
        next(new Error('Joint venture details are required when joint venture is acceptable and request is submitted'));
    }
    
    next();
});

// Virtual for the full opportunity reference
businessOpportunitySchema.virtual('reference').get(function() {
    return `${this.opportunityNumber} - ${this.client.name}`;
});

// Methods
businessOpportunitySchema.methods.isEligibleForApproval = function() {
    return this.status === 'Verification' && this.requestStatus === 'Submitted';
};

// Statics
businessOpportunitySchema.statics.findByClientName = function(clientName) {
    return this.find({ 'client.name': new RegExp(clientName, 'i') });
};

businessOpportunitySchema.statics.findByUltimateCustomer = function(customerName) {
    return this.find({ 'ultimateCustomer.name': new RegExp(customerName, 'i') });
};



module.exports = mongoose.model('BusinessOpportunity', businessOpportunitySchema);