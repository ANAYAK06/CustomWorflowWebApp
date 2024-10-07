const natureofAccounts = require('../models/accountsNatureModel')


const allAccountsNatures = async(req,res)=>{
    const response = await natureofAccounts.find()
    res.status(200).json(response)
}


module.exports = {
    allAccountsNatures
}