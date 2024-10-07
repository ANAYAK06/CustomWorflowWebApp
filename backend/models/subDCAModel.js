const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const subDcaSchema = new Schema({

    subCode: {
        type:String,
        unique: true,
        required: true
    },
    subdcaName:{
        type:String,
        unique: true,
        required: true

    },
    dcaCode: {  
        type: String,
        required: true
    }
},
{
    timestamps: true
}

)







module.exports = mongoose.model('subdca', subDcaSchema);