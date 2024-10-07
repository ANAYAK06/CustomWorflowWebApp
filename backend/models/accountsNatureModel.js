const mongoose = require('mongoose')

const Schema = mongoose.Schema

const accountsNatureSchema = new Schema({
    natureId :{
        type:Number,
        required:true
    },
    accountsNature: {
        type:String,
        required:true
    }
})

module.exports = mongoose.model('accountsnature', accountsNatureSchema)