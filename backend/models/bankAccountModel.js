const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const BankDetialsSchema = new Schema({
    accountType: {
        type: String,
        enum: ['OD', 'Current', 'Savings'],
        required: true
    },
    bankName: {
        type: String,
        required: true,
        trim: true
    },
    branch: {
        type: String,
        required: true,
        trim: true
    },
    accountNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    accountOpeningDate: {
        type: Date,
        required: true
    },
    accountingGroupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'accountgroup',
        required: true
    },
    ifscCode: {
        type: String,
        required: true,
        trim: true,
        uppercase: true
    },
    micrCode: {
        type: String,
        trim: true
    },
    branchAddress: {
        street: String,
        city: String,
        state: String,
        pincode: String,
        country: String
    },
    contactNumber: {
        type: String,
        trim: true
    },
    enabledForOnlineTransaction: {
        type: Boolean,
        default: false
    },
    creditCard: {
        hasCard: {
            type: Boolean,
            default: false
        },
        cardNumber: {
            type: String,
            trim: true
        },
        validThru: Date
    },
    openingBalance: {
        type: Number,
        required: true,
        default: 0,
        validate: {
            validator: function(value) {
                if (this.accountType === 'OD') return true;
                return value >= 0;
            },
            message: 'Opening balance can only be negative for OD accounts'
        }
    },
    balanceAsOn: {
        type: Date,
        required: true
    },
    minimumBalance: {
        type: Number,
        required: true,
        validate: {
            validator: function(value) {
                if (this.accountType === 'OD') return true;
                return value >= 0;
            },
            message: 'Negative balance is only allowed for OD accounts'
        }
    },
    balance: {
        type: Number,
        validate: {
            validator: function(value) {
                if (this.accountType === 'OD') return true;
                return value >= this.minimumBalance;
            },
            message: 'Balance cannot be less than minimum balance'
        }
    },
    accountStatus: {
        type: String,
        enum: ['active', 'inactive', 'blocked'],
        default: 'active'
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
}, { timestamps: true });

// Pre-save middleware to set initial balance and validate accounting group
BankDetialsSchema.pre('save', async function(next) {
    if (this.isNew) {
        this.balance = this.openingBalance;
        
        // Set accounting group based on account type
        const AccountGroup = mongoose.model('accountgroup');
        const natureId = this.accountType === 'OD' ? 4 : 3; // 4 for Liabilities, 3 for Assets
        
        const group = await AccountGroup.findOne({ natureId });
        if (!group) {
            throw new Error('Invalid account nature for this account type');
        }
        
        this.accountingGroupId = group._id;
    }
    next();
});

BankDetialsSchema.index({ accountNumber: 1, bankName: 1 });

BankDetialsSchema.methods.updateBalance = async function(amount) {
    const newBalance = this.balance + amount;
    
    if (this.accountType !== 'OD' && newBalance < this.minimumBalance) {
        throw new Error('Transaction would result in balance below minimum balance');
    }
    
    this.balance = newBalance;
    return this.save();
};

BankDetialsSchema.virtual('availableBalance').get(function() {
    if (this.accountType === 'OD') {
        return this.balance - this.minimumBalance;
    }
    return this.balance;
});

module.exports = mongoose.model('BankDetails', BankDetialsSchema);