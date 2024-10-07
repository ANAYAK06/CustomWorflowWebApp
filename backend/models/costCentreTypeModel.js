const mongoose = require('mongoose')


const Schema = mongoose.Schema

const costCentreTypeScheema = new Schema ({

   
    ccType : {
        type:String,
        required:true
    },
    ccid: {
        type:Number,
        required:true

    },
    subType: [
        {
            sType:String,
            subId:Number
        }
    ]

})

module.exports = mongoose.model('CostCentreType', costCentreTypeScheema)