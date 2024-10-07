const mongoose = require('mongoose')




const Schema = mongoose.Schema


const userSchema = new Schema({

    userName :{
        type:String,
        required:true
    },
    email :{
        type:String,
        required:true,
        unique:true
    },
    password : {
        type:String,
        required:true
    },
    roleId: {
        type:Number,
        ref:'UserRoles',
        required:true

    },
    status:{
        type:Number,
        required : true,
        default:0  //status in inactive
        

    },
    passwordRestToken:{
        type:String
    },
    passwordRestExpires:{
        type:Date


    },
    createdAt:{
        type:Date,
        default:Date.now
    }



})

module.exports = mongoose.model('Users',userSchema)