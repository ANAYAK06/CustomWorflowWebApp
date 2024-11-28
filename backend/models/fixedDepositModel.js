const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const FixedDepositSchema = new Schema({
    fdType: {
        type: String,
        enum: ['regular', 'taxSaver', 'cumulative', 'nonCumulative'],
        required: true
    },
    updateType: {
        type: String,
        enum: ['new', 'existing'],
        required: true
    },
    bankName: {
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
    depositAmount: {
        type: Number,
        required: true,
        min: 0
    },
    tenure: {
        years: {
            type: Number,
            required: true,
            min: 0
        },
        months: {
            type: Number,
            required: true,
            min: 0,
            max: 11
        },
        days: {
            type: Number,
            required: true,
            min: 0,
            max: 30
        }
    },
    rateOfInterest: {
        type: Number,
        required: true,
        min: 0,
        comment: 'Annual interest rate percentage'
    },
    interestPayout: {
        type: String,
        enum: ['monthly', 'quarterly', 'halfYearly', 'yearly', 'onMaturity'],
        required: true
    },
    depositDate: {
        type: Date,
        required: true
    },
    maturityDate: {
        type: Date,
        required: true
    },
    maturityAmount: {
        type: Number,
        required: true,
        min: 0
    },
    linkedBankAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BankDetails',
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
    autoRenewal: {
        isEnabled: {
            type: Boolean,
            default: false
        },
        renewalPeriod: {
            years: Number,
            months: Number,
            days: Number
        }
    },
    fdBalance: {
        type: Number,
        required: function() {
            return this.updateType === 'existing';
        },
        min: 0,
        comment: 'Current FD balance for existing FDs'
    },
    balanceAsOn: {
        type: Date,
        required: function() {
            return this.updateType === 'existing';
        },
        comment: 'Balance as on date for existing FDs'
    },
    status: {
        type: String,
        enum: ['active', 'matured', 'prematuredClosed', 'closed'],
        default: 'active'
    },
    verificationStatus: {
        type: String,
        required: true,
        enum: ['Rejected', 'Returned', 'Approved', 'Verification']
    },
    levelId: {
        type: Number,
        default: 1
    },
    prematureClosureDetails: {
        closureDate: Date,
        actualInterestRate: Number,
        interestPenalty: Number,
        finalAmount: Number,
        reason: String
    }
}, { timestamps: true });

// Method to calculate maturity amount
FixedDepositSchema.methods.calculateMaturityAmount = function() {
    const principal = this.depositAmount;
    const rate = this.rateOfInterest / 100;
    const timeInYears = this.tenure.years + (this.tenure.months / 12) + (this.tenure.days / 365);
    
    if (this.fdType === 'cumulative') {
        // Compound interest calculation
        return principal * Math.pow(1 + (rate / this.getCompoundingFrequency()), 
            this.getCompoundingFrequency() * timeInYears);
    } else {
        // Simple interest calculation
        return principal + (principal * rate * timeInYears);
    }
};

// Helper method to get compounding frequency
FixedDepositSchema.methods.getCompoundingFrequency = function() {
    switch(this.interestPayout) {
        case 'monthly': return 12;
        case 'quarterly': return 4;
        case 'halfYearly': return 2;
        case 'yearly': return 1;
        case 'onMaturity': return 1;
        default: return 4;
    }
};

// Pre-save middleware
FixedDepositSchema.pre('save', async function(next) {
    if (this.isNew) {
        // Calculate and set maturity amount
        this.maturityAmount = this.calculateMaturityAmount();

        if (this.updateType === 'new') {
            this.fdBalance = this.depositAmount;
            this.balanceAsOn = this.depositDate;
        }
        
        // Calculate and set maturity date
        const maturityDate = new Date(this.depositDate);
        maturityDate.setFullYear(maturityDate.getFullYear() + this.tenure.years);
        maturityDate.setMonth(maturityDate.getMonth() + this.tenure.months);
        maturityDate.setDate(maturityDate.getDate() + this.tenure.days);
        this.maturityDate = maturityDate;
    }
    next();
});

// Indexes
FixedDepositSchema.index({ accountNumber: 1 });
FixedDepositSchema.index({ bankName: 1, status: 1 });

module.exports = mongoose.model('FixedDeposit', FixedDepositSchema);