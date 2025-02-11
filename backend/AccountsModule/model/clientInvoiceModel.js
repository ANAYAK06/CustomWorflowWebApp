const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const AutoIncrement = require('mongoose-sequence')(mongoose);

// Base Amount Schema (reusable for invoice amounts)
const BaseAmountSchema = new Schema({
    basicAmount: {
        type: Number,
        required: true,
        default: 0
    },
    cgst: {
        type: Number,
        default: 0
    },
    sgst: {  // Changed from sgstOrUtgst to sgst
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

// Main Invoice Schema
const ClientInvoiceSchema = new Schema({
    // Reference Fields
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true
    },
    clientName: {
        type: String,
        required: true,
        trim: true
    },
    subClientId: {
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'SubClient', 
        required: true
    },
    subClientCode: {
        type: String,
        required: true,
        trim: true
    },
    gstNumber: {
        type: String,
        required: true,
        trim: true,
        uppercase: true
    },
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
    poNumber: {
        type: String,
        required: true,
        trim: true
    },
    
    // Invoice Details
    invoiceNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    invoiceDate: {
        type: Date,
        required: true
    },
    dueDate: {
        type: Date,
        required: true
    },

    // Original Invoice Amounts
    originalAmounts: {
        type: BaseAmountSchema,
        required: true
    },

    // Retention Details
    retentionPercentage: {
        type: Number,
        default: 0
    },
    retentionAmount: {
        type: Number,
        default: 0
    },
    retentionBalance: {
        type: Number,
        default: function() {
            return this.retentionAmount;
        }
    },

    // Hold Details
    holdAmount: {
        type: Number,
        default: 0
    },
    holdBalance: {
        type: Number,
        default: function() {
            return this.holdAmount;
        }
    },
    
    // Reference amounts (updated by other collections)
    creditNoteTotal: {
        type: Number,
        default: 0
    },
    debitNoteTotal: {
        type: Number,
        default: 0
    },
    tdsAmount: {  // Total TDS/Advance Tax deducted
        type: Number,
        default: 0
    },
    otherDeductionsTotal: {
        type: Number,
        default: 0
    },
    receivedAmount: {
        type: Number,
        default: 0
    },
    
    // Status fields
    invoiceStatus: {  // Payment status
        type: String,
        required: true,
        enum: ['Submitted', 'Partially_Paid', 'Paid', 'Overdue', 'Cancelled'],
        default: 'Submitted'
    },
    
    approvalStatus: {  // Approval workflow status
        type: String,
        required: true,
        enum: ['Rejected', 'Returned', 'Approved', 'Verification'],
        default: 'Verification'
    },

    levelId: {
        type: Number,
        default: 1
    },

    financialYear: {
        type: String,
        required: true,
        validate: {
            validator: function(v) {
                // Only accept YYYY-YY format (e.g., 2024-25)
                return /^\d{4}-\d{2}$/.test(v);
            },
            message: props => `${props.value} is not a valid financial year format (YYYY-YY)`
        }
    },

    // Balance tracking
    balances: {
        basicBalance: {
            type: Number,
            default: function() {
                return this.originalAmounts.basicAmount;
            }
        },
        cgstBalance: {
            type: Number,
            default: function() {
                return this.originalAmounts.cgst;
            }
        },
        sgstBalance: {
            type: Number,
            default: function() {
                return this.originalAmounts.sgst;
            }
        },
        igstBalance: {
            type: Number,
            default: function() {
                return this.originalAmounts.igst;
            }
        },
        totalBalance: {
            type: Number,
            default: function() {
                return this.originalAmounts.total;
            }
        }
    },

    remarks: String
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtuals for calculations
ClientInvoiceSchema.virtual('netAmount').get(function() {
    return this.originalAmounts.total - this.retentionAmount - this.holdAmount;
});

ClientInvoiceSchema.virtual('balanceAmount').get(function() {
    return this.netAmount - 
           this.creditNoteTotal + 
           this.debitNoteTotal - 
           this.tdsAmount - 
           this.otherDeductionsTotal - 
           this.receivedAmount;
});

// Auto-increment plugin for invoice number generation
ClientInvoiceSchema.plugin(AutoIncrement, {
    inc_field: 'invoiceSequence',
    start_seq: 1
});

// Pre-save middleware for invoice number generation and financial year
ClientInvoiceSchema.pre('save', async function(next) {
    // Get invoice date year
    const currentYear = new Date(this.invoiceDate).getFullYear();
    const nextYear = currentYear + 1;
    
    // Format financial year as YYYY-YY (e.g., 2024-25)
    const shortNextYear = nextYear.toString().slice(-2);
    this.financialYear = `${currentYear}-${shortNextYear}`;
    
    // Generate invoice number if not exists
    if (!this.invoiceNumber) {
        this.invoiceNumber = `EP/${this.financialYear}/${String(this.invoiceSequence).padStart(3, '0')}`;
    }
    
    next();
});



// Indexes
ClientInvoiceSchema.index({ invoiceNumber: 1 }, { unique: true });
ClientInvoiceSchema.index({ clientId: 1 });
ClientInvoiceSchema.index({ subClientId: 1 });
ClientInvoiceSchema.index({ ccCode: 1 });
ClientInvoiceSchema.index({ invoiceStatus: 1 });
ClientInvoiceSchema.index({ invoiceDate: -1 });

module.exports = mongoose.model('ClientInvoice', ClientInvoiceSchema);