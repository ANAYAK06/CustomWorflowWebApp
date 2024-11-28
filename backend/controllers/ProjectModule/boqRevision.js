const BOQ = require('../../models/boqModel');
const Permission = require('../../models/permissionModel');
const NotificationHub = require('../../models/notificationHubModel');
const notificationEmitter = require('../../notificationEmitter');
const { addSignatureAndRemarks, getSignatureandRemakrs } = require('../../controllers/signatureAndRemarks');
const SignatureandRemakrs = require('../../models/signatureAndRemarksmodel')

const getAcceptedBOQs = async (req, res) => {
    try {
        const boqs = await BOQ.find({ boqStatus: 'Accepted' })
            .populate('businessOpportunity')
            .sort('-createdAt');
        res.json(boqs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


module.exports = {
    getAcceptedBOQs
}