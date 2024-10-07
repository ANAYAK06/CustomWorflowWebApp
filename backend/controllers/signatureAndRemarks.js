const SignatureAndRemarks = require('../models/signatureAndRemarksmodel')


const addSignatureAndRemarks = async (relatedEntityId, roleId, levelId, remarks, userId, userName) => {

    try {
        const newSignatureAndRemarks = new SignatureAndRemarks({
            relatedEntityId,
            roleId,
            levelId,
            remarks,
            userId,
            userName
        })
        await newSignatureAndRemarks.save()
        return newSignatureAndRemarks
    } catch (error) {
        console.error('Error for adding signature and remakrs', error)
    }
}

const getSignatureandRemakrs = async(relatedEntityId) => {
    try {
        const signature = await SignatureAndRemarks.find({relatedEntityId}).sort({levelId:1, createdAt:1})
        return signature
    } catch (error) {
        console.error('Error fetching signatures and remarks:', error);
        throw error;
        
    }
}

module.exports ={
    addSignatureAndRemarks,
    getSignatureandRemakrs
}