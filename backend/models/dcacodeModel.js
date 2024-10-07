
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const dcaSchema = new Schema({
    code: {
        type: String,
        unique: true,
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    applicableCostCentres: [{
        ccid: {
            type: Number,
            ref: 'CostCentreType',
            required: true
        },
        subId: [{
            type: Number,
            ref: 'CostCentreType.subType'
        }]
    }],
    applicableForItemCode: {
        type: Boolean,
        default: false
    },
    itemCodeType: {
        type: String,
        enum: ['Service', 'Material'],
        required: function() { return this.applicableForItemCode; },
        validate: {
            validator:function(v){
                return !this.applicableForItemCode || (v && v.length > 0)
            },
            message:'Item code type is required when applicable item code is true '
        }
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

dcaSchema.index({ code: 1 }, { unique: true });

module.exports = mongoose.model('DCA', dcaSchema);