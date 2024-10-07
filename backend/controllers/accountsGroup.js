const AccountGroup = require('../models/accountsGroupsModel')



const getAllGroupDetails = async(req, res)=>{
    try {
        const response = await AccountGroup.find()
        res.status(200).json(response)
        
        
    } catch (error) {
        res.status(400).json({error:error.message})
    }
}



const createAccountsGroup = async(req,res)=>{
    try {
        const newAccountGroup = new AccountGroup({
            groupId:req.body.groupId,
            groupName:req.body.groupName,
            groupUnder: req.body.groupUnder,
            natureId: req.body.natureId,
            affectsGrossProfit: req.body.affectsGrossProfit,
            reportIndex: req.body.reportIndex,
            reportType: req.body.reportType,
            isBuiltIn: req.body.isBuiltIn
        })

        const savedAccountGroup = await newAccountGroup.save()
        res.status(201).json(savedAccountGroup);
        
    } catch (error) {
        res.status(400).json({ message: error.message });
        
    }
}

module.exports = {
    getAllGroupDetails,
    createAccountsGroup

}