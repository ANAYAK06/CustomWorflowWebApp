const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const LoanSchema = new Schema({
    loanType: {
        type: String,
        enum: ['secured', 'unsecured'],
        required: true
    },
    updateType:{
        type:String,
        enum:['new', 'existing'],
        required:true

    },
    lenderName: {
        type: String,
        required: true,
        trim: true
    },
    lenderType: {
        type: String,
        enum: ['bank', 'agency', 'director', 'individual', 'others'],
        required: true
    },
    loanPurpose: {
        type: String,
        enum: ['workingCapital', 'assetPurchase', 'others'],
        required: true
    },
    loanNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    disbursementDate: {
        type: Date,
        required: true
    },
    loanAmount: {
        type: Number,
        required: true,
        min: 0,
        comment: 'Total loan amount approved/sanctioned'
    },
    charges: {
        processingFee: {
            type: Number,
            default: 0,
            min: 0
        },
        documentationCharges: {
            type: Number,
            default: 0,
            min: 0
        },
        insuranceCharges: {
            type: Number,
            default: 0,
            min: 0
        },
        otherCharges: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    disbursedAmount: {
        type: Number,
        validate: {
            validator: function() {
                const totalCharges = this.getTotalCharges();
                return this.disbursedAmount === (this.loanAmount - totalCharges);
            },
            message: 'Disbursed amount must equal loan amount minus all charges'
        }
    },
    rateOfInterest: {
        type: Number,
        required: true,
        min: 0,
        comment: 'Annual interest rate percentage'
    },
    numberOfInstallments: {
        type: Number,
        required: true,
        min: 1
    },
    emiStartDate: {
        type: Date,
        required: true,
        validate: {
            validator: function(value) {
                return value >= this.disbursementDate;
            },
            message: 'EMI start date must be after or equal to disbursement date'
        }
    },
    linkedBankAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BankDetails',
        required: true
    },
    amountReceiptType: {
        type: String,
        enum: ['bankAccount', 'thirdParty'],
        required: true
    },
    accountingGroupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'accountgroup',
        required: true,
        validate: {
            validator: async function(value) {
                try {
                    const accountGroup = await mongoose.model('accountgroup').findById(value);
                    return accountGroup !== null;
                } catch (error) {
                    return false;
                }
            },
            message: props => `${props.value} is not a valid accounting group ID`
        }
    },
    openingBalance: {
        type: Number,
        default: function() {
            return this.loanAmount; // Opening balance is the full loan amount
        }
    },
    openingBalanceAsOn: {
        type: Date,
        required: true
    },
    loanBalance: {
        type: Number,
        comment: 'Current outstanding loan amount including interest'
    },
    loanStatus: {
        type: String,
        enum: ['active', 'closed', 'hold'],
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
    securityDetails: {
        type: {
            assetType: String,
            assetValue: Number,
            assetDescription: String,
            documentNumbers: [String]
        },
        required: function() {
            return this.loanType === 'secured';
        }
    }
}, { timestamps: true });

// Method to calculate total charges
LoanSchema.methods.getTotalCharges = function() {
    const { processingFee, documentationCharges, insuranceCharges, otherCharges } = this.charges;
    return processingFee + documentationCharges + insuranceCharges + otherCharges;
};

// Pre-save middleware to calculate disbursed amount and set initial loan balance
LoanSchema.pre('save', async function(next) {
    if (this.isNew) {
        // Calculate disbursed amount
        const totalCharges = this.getTotalCharges();
        this.disbursedAmount = this.loanAmount - totalCharges;
        
        // Set initial loan balance to full loan amount
        this.loanBalance = this.loanAmount;
        
        // Only set accountingGroupId if not provided
        if (!this.accountingGroupId) {
            const AccountGroup = mongoose.model('accountgroup');
            const natureId = 4; // Assuming 4 is for Liabilities
            
            const group = await AccountGroup.findOne({ natureId });
            if (!group) {
                throw new Error('Invalid account nature for loans');
            }
            
            this.accountingGroupId = group._id;
        }
    }
    next();
});

// Method to update loan balance after payment
LoanSchema.methods.updateLoanBalance = async function(paymentAmount) {
    const newBalance = this.loanBalance - paymentAmount;
    
    if (newBalance < 0) {
        throw new Error('Payment amount exceeds loan balance');
    }
    
    this.loanBalance = newBalance;
    if (newBalance === 0) {
        this.loanStatus = 'closed';
    }
    return this.save();
};

// Virtual for EMI calculation based on loan amount (not disbursed amount)
LoanSchema.virtual('emiAmount').get(function() {
    const P = this.loanAmount; // Using full loan amount for EMI calculation
    const r = this.rateOfInterest / (12 * 100); // Monthly interest rate
    const n = this.numberOfInstallments;
    
    return (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
});

// Indexes for better query performance
LoanSchema.index({ loanNumber: 1 });
LoanSchema.index({ lenderName: 1, loanType: 1 });

module.exports = mongoose.model('Loan', LoanSchema);