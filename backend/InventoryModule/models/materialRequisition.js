const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Item Schema (for items within a requisition)
const requisitionItemSchema = new Schema({
  // Item identification
  itemCode: {
    type: String,
    required: true,
    trim: true
  },
  specificationId: {
    type: Schema.Types.ObjectId,
    ref: 'SpecificationCode',
    required: true
  },
  baseCodeId: {
    type: Schema.Types.ObjectId,
    ref: 'ItemCode',
    required: true
  },
  
  // Budget consumption fields
  dcaCode: {
    type: String,
    required: true
  },
  subDcaCode: {
    type: String,
    required: true
  },
  
  // Item details
  itemName: {
    type: String,
    required: true,
    trim: true
  },
  make: {
    type: String,
    trim: true
  },
  specification: {
    type: String,
    trim: true
  },
  
  // Unit and quantity information
  unit: {
    type: Schema.Types.ObjectId,
    ref: 'Unit',
    required: true
  },
  originalUnit: {
    type: Schema.Types.ObjectId,
    ref: 'Unit'
  },
  unitConversionFactor: {
    type: Number,
    default: 1
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  balanceQuantity: {
    type: Number,
    min: 0
  },
  
  // Pricing information
  basicPrice: {
    type: Number,
    required: true,
    min: 0
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Category information
  itemCategory: {
    type: Number,
    enum: [1, 2, 3, 4], // 1-Asset, 2-SemiAsset/Semiconsumable, 3-Consumables, 4-Raw Materials
    required: true
  },
  isAsset: {
    type: Boolean,
    default: false
  },
  assetCategory: {
    type: String
  }
});

// Main Material Requisition Schema
const materialRequisitionSchema = new Schema({
  batchId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  requestNo: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  requestDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  costCenter: {
    type: Schema.Types.ObjectId,
    ref: 'CostCenter',
    required: true
  },
  items: [requisitionItemSchema],
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  requestStatus: {
    type: String,
    enum: ['Draft', 'Pending', 'Verified', 'Approved', 'Rejected', 'Cancelled', 'Fulfilled', 'Partially Fulfilled'],
    default: 'Draft'
  },
  levelId: {
    type: Number,
    default: 1
  },
  status: {
    type: String,
    enum: ['Verification', 'Approved', 'Rejected'],
    default: 'Verification'
  },
  remarks: {
    type: String,
    trim: true
  },
}, {
  timestamps: true
});

// Auto-populate the totalAmount field based on items
materialRequisitionSchema.pre('save', function(next) {
  if (this.items && this.items.length > 0) {
    this.totalAmount = this.items.reduce((total, item) => total + item.amount, 0);
  }
  next();
});

// Create a compound index for faster searches
materialRequisitionSchema.index({ batchId: 1, requestNo: 1 });

module.exports = mongoose.model('MaterialRequisition', materialRequisitionSchema);