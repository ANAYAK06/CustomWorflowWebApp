const mongoose = require('mongoose')

const Schema = mongoose.Schema


const permissionSchema = new Schema({
    workflowId:{
        type:Number,
        required:true,
        ref:'usermenudata'
    },
    workflowname:{
        type:String,
        required:true,
        ref:'usermenudata'
    },
    isCostCentreApplicable:{
        type:Boolean
    },
   
    workflowDetails: [
        
        {
            costCentreType:{
                type:Number,
                required: function(){return this.isCostCentreApplicable}
            },
            roleId:{
                type:Number,
                required:true,
                
            },
            approvalLimit:{
                type:Number
            },
            pathId:{
                type:Number,
                required:true, 
                ref:'usermenudata'
            },
            levelId:{ 
                type:Number  
        
            }
        }
    ]
    

})
module.exports = mongoose.model('permission', permissionSchema)