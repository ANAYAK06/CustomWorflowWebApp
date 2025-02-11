const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const AutoIncrement = require('mongoose-sequence')(mongoose);

// Address Schema (reusable)
const AddressSchema = new Schema({
    street: {
        type: String,
        required: true,
        trim: true
    },
    city: {
        type: String,
        required: true,
        trim: true
    },
    state: {
        type: String,
        required: true,
        trim: true
    },
    pincode: {
        type: String,
        required: true,
        trim: true,
        validate: {
            validator: function(v) {
                return /^\d{6}$/.test(v);
            },
            message: 'Pincode must be 6 digits'
        }
    },
    country: {
        type: String,
        default: 'India',
        trim: true
    }
});

// Contact Person Schema
const ContactPersonSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    designation: {
        type: String,
        trim: true
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        validate: {
            validator: function(v) {
                return !v || /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
            },
            message: 'Please enter a valid email'
        }
    },
    phone: {
        type: String,
        required: true,
        trim: true,
        validate: {
            validator: function(v) {
                return /^\d{10}$/.test(v);
            },
            message: 'Phone number must be 10 digits'
        }
    },
    isActive: {
        type: Boolean,
        default: true
    }
});
const CostCenterBalanceSchema = new Schema({
    ccCode: {
        type: String,
        required: true,
        trim: true
    },
    ccName: {
        type: String,
        required: true,
        trim: true
    },
    basicAmount: {
        type: Number,
        required: true,
        default: 0
    },
    cgst: {
        type: Number,
        default: 0
    },
    sgst: {
        type: Number,
        default: 0
    },
    igst: {
        type: Number,
        default: 0
    },
    total: {
        type: Number,
        default: function() {
            return this.basicAmount + (this.cgst || 0) + (this.sgst || 0) + (this.igst || 0);
        }
    }
});

// Bank Account Schema
const BankAccountSchema = new Schema({
    accountName: {
        type: String,
        required: true,
        trim: true
    },
    accountNumber: {
        type: String,
        required: true,
        trim: true
    },
    bankName: {
        type: String,
        required: true,
        trim: true
    },
    branchName: {
        type: String,
        required: true,
        trim: true
    },
    ifscCode: {
        type: String,
        required: true,
        trim: true,
        uppercase: true
    },
    isDefault: {
        type: Boolean,
        default: false
    }
});

// GST Balance Schema
const GSTBalanceSchema = new Schema({
    basicAmount: {
        type: Number,
        required: true,
        default: 0
    },
    cgst: {
        type: Number,
        default: 0
    },
    sgst: {
        type: Number,
        default: 0
    },
    igst: {
        type: Number,
        default: 0
    },
    total: {
        type: Number,
        default: function() {
            return this.basicAmount + (this.cgst || 0) + (this.sgst || 0) + (this.igst || 0);
        }
    }
});

const ClientSchema = new Schema({
    clientCode: {
        type: String,
        unique: true,
        trim: true,
        required:true
    },
    clientName: {
        type: String,
        required: true,
        trim: true
    },
    clientType: {
        type: String,
        required: true,
        enum: ['Individual', 'Proprietorship', 'Partnership', 'PrivateLimited', 'PublicLimited', 'Government', 'Trust', 'Society'],
        default: 'Individual'
    },
    gstType: {
        type: String,
        enum: ['Regular', 'Composite', 'Unregistered'],
        required: function() {
            // GST Type is required for all except individuals without GST
            return !(this.clientType === 'Individual' && !this.mainGstNumber);
        }
    },
    pan: {
        type: String,
        trim: true,
        uppercase: true,
        required: function() {
            // PAN is required for all except some individuals
            return this.clientType !== 'Individual';
        },
        validate: {
            validator: function(v) {
                if (!v) return true; // Allow empty if not required
                return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v);
            },
            message: 'Invalid PAN format'
        }
    },
    mainGstNumber: {
        type: String,
        trim: true,
        uppercase: true,
        required: function() {
            // GST is not mandatory for individuals and small businesses
            return ['PrivateLimited', 'PublicLimited', 'Government'].includes(this.clientType);
        },
        validate: {
            validator: function(v) {
                if (!v) return true; // Allow empty if not required
                return /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/.test(v);
            },
            message: 'Invalid GST Number format'
        }
    },
    accountingGroupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'accountgroup',
        required: true
    },
    registeredAddress: AddressSchema,
    corporateAddress: AddressSchema,
    contactPersons: [ContactPersonSchema],
    bankAccounts: [BankAccountSchema],
    creditPeriod: {
        type: Number,
        default: 0,
        min: 0
    },
    creditLimit: {
        type: Number,
        default: 0,
        min: 0
    },
    levelId: {
        type: Number,
        default: 1
    },
    clientStatus: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active'
    },
    status: {
        type: String,
        required: true,
        enum: ['Rejected', 'Returned', 'Approved', 'Verification'],
        default: 'Verification'
    },
    remarks: {
        type: String,
        trim: true
    }
}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// SubClient Schema (in the same file)
const SubClientSchema = new Schema({
    mainClientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true
    },
    subClientCode: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    gstNumber: {
        type: String,
        trim: true,
        uppercase: true,
        required: function() {
            // Check parent client's type for GST requirement
            return this.parent().gstType !== 'Unregistered';
        },
        validate: {
            validator: function(v) {
                if (!v) return true;
                return /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/.test(v);
            },
            message: 'Invalid GST Number format'
        }
    },
    registeredAddress: AddressSchema,
    costCenterBalances: {
        type: [CostCenterBalanceSchema],
        required: function() {
            return this.hasOpeningBalance;
        }
    },
    hasOpeningBalance: {
        type: Boolean,
        required: true,
        default: false
    },
    balanceAsOn: {
        type: Date,
        required: function() {
            return this.hasOpeningBalance;
        }
    },
    stateCode: {
        type: String,
        required: true,
        trim: true
    },
    levelId: {
        type: Number,
        default: 1
    },
    clientStatus: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active'
    },
    status: {
        type: String,
        required: true,
        enum: ['Rejected', 'Returned', 'Approved', 'Verification'],
        default: 'Verification'
    },
    remarks: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});




// Indexes
ClientSchema.index({ clientCode: 1 }, { unique: true });
ClientSchema.index({ clientName: 1 });
ClientSchema.index({ mainGstNumber: 1 });

SubClientSchema.index({ mainClientId: 1, stateCode: 1 }, { unique: true });
SubClientSchema.index({ subClientCode: 1 }, { unique: true });
SubClientSchema.index({ gstNumber: 1 });



// Pre-save middleware for subclient code generation
SubClientSchema.pre('save', async function(next) {
    if (!this.subClientCode) {
        const mainClient = await mongoose.model('Client').findById(this.mainClientId);
        if (!mainClient) {
            throw new Error('Main client not found');
        }

        // Get count of existing subclients
        const count = await this.constructor.countDocuments({ mainClientId: this.mainClientId });
        
        // Generate subclient code (SC001001)
        this.subClientCode = `${mainClient.clientCode}${String(count + 1).padStart(3, '0')}`;
    }

    // Set state code from GST number if present
    if (this.gstNumber && !this.stateCode) {
        this.stateCode = this.gstNumber.substring(0, 2);
    }

    // Validate no duplicate state GST for same main client
    const existingSubClient = await this.constructor.findOne({
        mainClientId: this.mainClientId,
        stateCode: this.stateCode,
        _id: { $ne: this._id }
    });
    
    if (existingSubClient) {
        throw new Error('GST registration already exists for this state');
    }
    
    next();
});

// Virtual for total balance in SubClient
SubClientSchema.virtual('totalBalance').get(function() {
    if (!this.hasOpeningBalance) return 0;
    return this.costCenterBalances.reduce(
        (sum, ccBalance) => sum + ccBalance.total, 
        0
    );
});


module.exports = {
    Client: mongoose.model('Client', ClientSchema),
    SubClient: mongoose.model('SubClient', SubClientSchema)};