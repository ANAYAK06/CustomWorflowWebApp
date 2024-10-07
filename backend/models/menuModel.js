const mongoose = require('mongoose')


const Schema = mongoose.Schema

const menuDataSchema = new Schema({
    mid:Number,
    title:String,
    icon:String,
    subemenu:Boolean,
    smid:Number,
    submenuItems: [
        {
            linkid:Number,
            title:String,
            path:String
        }
    ]

})

module.exports = mongoose.model('menu', menuDataSchema)