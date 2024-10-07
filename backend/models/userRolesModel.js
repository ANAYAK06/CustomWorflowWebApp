const mongoose = require('mongoose')
const Schema = mongoose.Schema


const userRoleSchema = new Schema ({

    roleName :{
        type:String,
        unique:true,
        required:true
    },
    roleId: {
        type:Number,
        unique:true,
        
    },
    isCostCentreApplicable: {
        type:Boolean,
        required:true,
        default:false
        

    },

    costCentreTypes: [{
        type:Number,
        ref:'CostCentreType'
    }]
});


userRoleSchema.pre('save', async function(next){
    try {
        if(!this.isNew){
            return next()
        }
        const maxRoleId = await this.constructor.findOne({},{roleId:1},{sort:{roleId: -1}} )

        if(!maxRoleId){
            this.roleId =100

        }else{
            this.roleId = maxRoleId.roleId + 1
        }
        next()


    } catch (error) {

        next(error)
        
    }
})

userRoleSchema.pre('validate', function(next){
    if(this.isCostCentreApplicable &&  (!this.costCentreTypes || this.costCentreTypes.length === 0)){
        this.invalidate('costCentreTypes','Cost Centre Types are required when cost centre is applicable.');
    }
    next()
});


module.exports = mongoose.model('UserRoles', userRoleSchema)