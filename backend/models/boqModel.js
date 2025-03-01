// models/boqModel.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const businessOpportunityModel = require('./businessOpportunityModel');

// Schema for attachments
const attachmentSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    filePath: {
        type: String,
        required: true
    },
    fileType: String,
    uploadedAt: {
        type: Date,
        default: Date.now
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
});

// Schema for individual BOQ items
const boqItemSchema = new Schema({
    itemCode:{
        type:String,
        required:true

    },
    slNo: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    unit: {
        type: String,
        required: true
    },
    qty: {
        type: Number,
        required: true
    },
   
    unitRate: {
        type: Number,
        required: true
    },
    minimumRate: {
        type: Number,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    remarks: {
        type: String
    },
    attachmentRequired: {
        type: Boolean,
        default: false
    },
    attachment: {
        fileName: String,
        filePath: String,
        uploadedAt: Date
    }
});

// Main BOQ Schema
const boqSchema = new Schema({
    offerNumber: {
        type: String,
        unique: true,
        sparse:true,
      
    },
    businessOpportunity: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BusinessOpportunity',
        required: true
    },
    tenderNumber: {
        type: String
    },
    items: [boqItemSchema],
    totalAmount: {
        type: Number,
        required: true
    },
    originalAmount: {  
        type: Number,
        
    },
    variationAcceptance: {  // Added new field
        type: Number,
        required: true,
        min: 0,
        max: 100,
        default: 0,
        validate: {
            validator: function(v) {
                return v >= 0 && v <= 100;
            },
            message: props => `${props.value} is not a valid percentage! Value must be between 0 and 100`
        }
    },
    checklist: [{
        checklistId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Checklist'
        },
        checklistItemId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        comments: {
            type: String,
            default: ''
        }
    }],
    attachments: {
        type: [attachmentSchema],
        validate: [
            {
                validator: function(v) {
                    return v.length <= 5;
                },
                message: 'Maximum 5 attachments are allowed'
            }
        ]
    },
    boqStatus:{
        type: String,
        enum:['Submitted','Accepted','Returned', 'Rejected','Revision','prepareToSubmit','submittedToClient','won', 'lost','POCreated'],
        default:'Submitted'
    },
    status: {
        type: String,
        enum: [ 'Verification', 'Approved', 'Rejected'],
        default: 'Verification'
    },
    levelId: {
        type: Number,
        default: 1
    }
    
}, {
    timestamps: true
});


boqSchema.pre('save', async function(next) {
    try {
        if (this.isNew && !this.offerNumber) {
            console.log('Pre-save: Generating offer number...');
            
            const businessOpp = await mongoose.model('BusinessOpportunity').findById(this.businessOpportunity);
            console.log('Found Business Opportunity:', businessOpp);

            if (!businessOpp) {
                throw new Error('Business opportunity not found');
            }

            if (!businessOpp.businessCategory) {
                throw new Error('Business category is required');
            }

            const date = new Date();
            const year = date.getFullYear().toString().slice(-2);
            const month = (date.getMonth() + 1).toString().padStart(2, '0');

            const categoryCode = {
                'E&I': 'EI',
                'HVSS': 'HV',
                'CIVIL': 'CV',
                'O&M': 'OM',
                'WU': 'WU',
                'MECH': 'ME'
            }[businessOpp.businessCategory];

            if (!categoryCode) {
                throw new Error(`Invalid business category: ${businessOpp.businessCategory}`);
            }

            // Find last offer number for this category and year
            const lastBOQ = await this.constructor.findOne(
                { 
                    offerNumber: new RegExp(`^EPPL/${categoryCode}/${year}/${month}/[0-9]{5}$`)
                },
                { offerNumber: 1 },
                { sort: { offerNumber: -1 } }
            );

            let serialNumber = '00001';
            if (lastBOQ?.offerNumber) {
                const lastSerial = parseInt(lastBOQ.offerNumber.split('/').pop());
                if (!isNaN(lastSerial)) {
                    serialNumber = (lastSerial + 1).toString().padStart(5, '0');
                }
            }

            this.offerNumber = `EPPL/${categoryCode}/${year}/${month}/${serialNumber}`;
            console.log('Generated Offer Number:', this.offerNumber);
        }
        next();
    } catch (error) {
        console.error('Error in pre-save middleware:', error);
        next(error);
    }
});


// Add error handling middleware
boqSchema.post('save', function(error, doc, next) {
    if (error.name === 'MongoServerError' && error.code === 11000) {
        // Handle duplicate key error
        next(new Error('Offer number already exists. Please try again.'));
    } else {
        next(error);
    }
});
boqSchema.pre('validate', async function(next) {
    try {
        if (this.isNew) {
            const businessOpp = await businessOpportunityModel.findById(this.businessOpportunity);
            
            if (!businessOpp) {
                throw new Error('Business opportunity not found');
            }

            // Take only first 3 characters from client name and convert to uppercase
            const clientCode = businessOpp.client.name
                .substring(0, 3)  // Take first 3 characters only
                .replace(/[^a-zA-Z]/g, '')  // Remove any non-alphabet characters
                .toUpperCase();

            let basePrefix;
            if (businessOpp.type === 'TENDER' && businessOpp.tenderDetails?.tenderNumber) {
                basePrefix = `${businessOpp.opportunityNumber.replace(/\//g, '-')}-${clientCode}-${businessOpp.tenderDetails.tenderNumber}`;
            } else {
                basePrefix = `${businessOpp.opportunityNumber.replace(/\//g, '-')}-${clientCode}-QTA`;
            }

            // Generate itemCode for each item
            this.items.forEach((item, index) => {
                if (!item.itemCode) {
                    item.itemCode = `${basePrefix}-CIC${(index + 1).toString().padStart(3, '0')}`;
                }
            });
        }
        next();
    } catch (error) {
        console.error('Error in item ID generation middleware:', error);
        next(error);
    }
});

// Add helper methods for attachments
boqSchema.methods.addAttachment = function(attachment) {
    if (this.attachments.length >= 5) {
        throw new Error('Maximum 5 attachments allowed');
    }
    this.attachments.push(attachment);
};

boqSchema.methods.removeAttachment = function(attachmentId) {
    this.attachments = this.attachments.filter(
        attachment => attachment._id.toString() !== attachmentId.toString()
    );
};
module.exports = mongoose.model('BOQ', boqSchema)