const mongoose = require('mongoose')

const Schema = mongoose.Schema

const stateSchema = new Schema({

    name: String,
    code:String
    

})

module.exports = mongoose.model('state', stateSchema)


