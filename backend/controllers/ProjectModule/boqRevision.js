const BOQ = require('../../models/boqModel');
const Permission = require('../../models/permissionModel');
const NotificationHub = require('../../models/notificationHubModel');
const notificationEmitter = require('../../notificationEmitter');
const { addSignatureAndRemarks, getSignatureandRemakrs } = require('../../controllers/signatureAndRemarks');
const SignatureandRemakrs = require('../../models/signatureAndRemarksmodel')
const BOQRateHistory = require('../../models/boqRateHistoryModel')


const checkRoleApprovalForRevision = async (boqId, roleId, levelId) => {
    const boq = await BOQ.findById(boqId);
    if (!boq) {
        throw new Error('BOQ not found');
    }

    // Get all signatures for this BOQ revision at current level
    const signatures = await SignatureandRemakrs.find({
        entityId: boqId,
        levelId: levelId,
        roleId: roleId,
        // Only check signatures after the most recent revision
        createdAt: { $gt: boq.updatedAt }
    });

    if (signatures.length > 0) {
        throw new Error('This BOQ revision has already been processed at your role level');
    }

    return true;
};



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

const updateBOQRates = async (req, res) => {
    try {
        const { id } = req.params;
        const { items, remarks, totalAmount } = req.body;

        // Find and validate BOQ
        const boq = await BOQ.findById(id).populate('businessOpportunity');
        if (!boq) {
            throw new Error('BOQ not found');
        }

        // Create rate histories and update BOQ items
        for (const updatedItem of items) {
            // Find the corresponding item in BOQ
            const boqItem = boq.items.find(item => item._id.toString() === updatedItem._id);
            if (!boqItem) {
                throw new Error(`Item with ID ${updatedItem._id} not found`);
            }

            // Find or create rate history
            let rateHistory = await BOQRateHistory.findOne({
                boqId: id,
                itemCode: boqItem.itemCode
            });

            if (!rateHistory) {
                // Create new history with original rate as revision 0
                rateHistory = new BOQRateHistory({
                    boqId: id,
                    itemCode: boqItem.itemCode,
                    rates: [{
                        rate: boqItem.unitRate,
                        revisionNumber: 0
                    }]
                });
            }

            // Add new rate to history
            const nextRevision = rateHistory.rates.length;
            rateHistory.rates.push({
                rate: updatedItem.unitRate,
                revisionNumber: nextRevision
            });

            await rateHistory.save();

            // Update BOQ item
            boqItem.unitRate = updatedItem.unitRate;
            boqItem.amount = updatedItem.amount;
        }

        // Update BOQ total amount and status
        boq.totalAmount = totalAmount;
        boq.status = 'Verification';
        boq.levelId = 1;
        boq.boqStatus = 'Revision';

        // Save updated BOQ
        await boq.save();

        // Add signature and remarks
        await addSignatureAndRemarks(
            id,
            req.user.roleId,
            0,
            remarks || 'BOQ Rates Revised',
            req.user._id,
            req.user.userName
        );

        // Create notification
        const permission = await Permission.findOne({ workflowId: 147 });
        if (!permission) {
            throw new Error('Workflow not found');
        }

        const workflowDetail = permission.workflowDetails.find(detail => detail.levelId === 1);
        if (!workflowDetail) {
            throw new Error('Workflow detail not found');
        }

        // Create notification
        const newNotification = new NotificationHub({
            workflowId: 147,
            roleId: workflowDetail.roleId,
            pathId: workflowDetail.pathId,
            levelId: 1,
            relatedEntityId: id,
            message: `BOQ Rates Revised for ${boq.businessOpportunity.client?.name}`,
            status: 'Pending'
        });
        await newNotification.save();

        // Emit notification
        notificationEmitter.emit('notification', {
            userRoleId: workflowDetail.roleId,
            count: 1
        });

        // Send response
        res.status(200).json({
            message: 'BOQ rates updated successfully',
            boq,
            notification: newNotification
        });

    } catch (error) {
        console.error('Error in updateBOQRates:', error);
        res.status(500).json({
            error: error.message,
            message: 'Failed to update BOQ rates'
        });
    }
};

const getBOQsForRevisionVerification = async (req, res) => {
    const userRoleId = parseInt(req.query.userRoleId);
    try {
        if (isNaN(userRoleId)) {
            return res.status(400).json({ message: 'Invalid userRoleId provided' });
        }

        const permission = await Permission.findOne({ workflowId: 147 });
        if (!permission) {
            return res.status(404).json({ message: 'Revision workflow not found' });
        }

        const relevantWorkflowDetails = permission.workflowDetails.filter(
            detail => detail.roleId === userRoleId
        );

        if (relevantWorkflowDetails.length === 0) {
            return res.status(403).json({
                message: 'Access denied: No matching workflow details found for this role',
                boqs: []
            });
        }

        const notifications = await NotificationHub.find({
            workflowId: 147,
            roleId: userRoleId,
            pathId: { $in: relevantWorkflowDetails.map(detail => detail.pathId) },
            status: 'Pending'
        });

        if (!notifications.length) {
            return res.status(200).json({
                message: 'No pending BOQ revisions for verification',
                boqs: []
            });
        }

        const boqIds = notifications.map(notification => notification.relatedEntityId);

        const boqs = await BOQ.find({
            _id: { $in: boqIds },
            status: 'Verification',
            boqStatus: 'Revision',
            levelId: { $in: relevantWorkflowDetails.map(detail => detail.levelId) }
        }).populate('businessOpportunity');

        const boqsWithSignatures = await Promise.all(boqs.map(async (boq) => {
            const signatureAndRemarks = await getSignatureandRemakrs(boq._id);
            return {
                ...boq.toObject(),
                signatureAndRemarks
            };
        }));

        res.json({
            success: true,
            message: 'BOQ revisions retrieved successfully',
            boqs: boqsWithSignatures
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const verifyBOQRevision = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;
        const userRoleId = req.user.roleId;

        if (!remarks) {
            return res.status(400).json({
                message: "Remarks are required for verification"
            });
        }

        const boq = await BOQ.findOne({
            _id: id,
            status: 'Verification',
            boqStatus: 'Revision'
        });

        if (!boq) {
            return res.status(404).json({
                message: "No BOQ revision found for verification"
            });
        }

        const { levelId } = boq;

        // Check if user has already approved at this level
        try {
            await checkRoleApprovalForRevision(id, userRoleId, levelId);
        } catch (error) {
            return res.status(400).json({
                message: error.message,
                code: 'ALREADY_APPROVED'
            });
        }

        // Get workflow permission
        const permission = await Permission.findOne({ workflowId: 147 });
        if (!permission) {
            throw new Error('Revision workflow not found');
        }

        // Add signature and remarks
        await addSignatureAndRemarks(
            id,
            req.user.roleId,
            levelId,
            remarks,
            req.user._id,
            req.user.userName
        );

        // Get next workflow level details
        const nextRoleDetail = permission.workflowDetails.find(
            detail => detail.levelId === levelId + 1
        );

        if (nextRoleDetail) {
            // Move to next level
            boq.levelId = nextRoleDetail.levelId;
            boq.updatedBy = req.user._id;
            await boq.save();

            // Update notification for next level
            await NotificationHub.findOneAndUpdate(
                { 
                    relatedEntityId: id,
                    workflowId: 147,
                    status: 'Pending'
                },
                {
                    levelId: nextRoleDetail.levelId,
                    roleId: nextRoleDetail.roleId,
                    pathId: nextRoleDetail.pathId,
                    status: 'Pending',
                    message: `BOQ revision moved to next level of verification`,
                    updatedAt: new Date()
                },
                { new: true }
            );

            // Emit notification for next level
            notificationEmitter.emit('notification', {
                userRoleId: nextRoleDetail.roleId,
                count: 1
            });

            // Get updated signatures and remarks
            const signatureAndRemarks = await getSignatureandRemakrs(id);

            return res.json({
                success: true,
                message: "BOQ revision verified and moved to next level",
                boq: {
                    ...boq.toObject(),
                    signatureAndRemarks
                }
            });
        } else {
            // Final approval of revision
            boq.status = 'Approved';
            boq.boqStatus = 'Accepted';
            boq.updatedBy = req.user._id;
            await boq.save();

            // Update notification status
            await NotificationHub.findOneAndUpdate(
                { 
                    relatedEntityId: id,
                    workflowId: 147,
                    status: 'Pending'
                },
                {
                    status: 'Approved',
                    message: 'BOQ revision has been approved',
                    updatedAt: new Date()
                }
            );

            // Get final signatures and remarks
            const signatureAndRemarks = await getSignatureandRemakrs(id);

            return res.json({
                success: true,
                message: "BOQ revision approved successfully",
                boq: {
                    ...boq.toObject(),
                    signatureAndRemarks
                }
            });
        }
    } catch (error) {
        console.error('Error in verifyBOQRevision:', error);
        res.status(500).json({ 
            success: false,
            error: error.message,
            message: 'Failed to verify BOQ revision',
            code: error.code || 'UNKNOWN_ERROR'
        });
    }
};


const rejectBOQRevision = async (req, res) => {
    try {
        const { id, remarks } = req.body;

        if (!remarks) {
            return res.status(400).json({
                message: "Remarks are required for rejecting revision"
            });
        }

        const boq = await BOQ.findOne({
            _id: id,
            status: 'Verification',
            boqStatus: 'Revision'
        });

        if (!boq) {
            return res.status(404).json({
                message: 'No BOQ revision found for verification'
            });
        }

        // Update BOQ status
        boq.status = 'Rejected';
        boq.boqStatus = 'Rejected';
        boq.updatedBy = req.user._id;
        await boq.save();

        // Update notification status
        await NotificationHub.findOneAndUpdate(
            { 
                relatedEntityId: id,
                workflowId: 147,
                status: 'Pending'
            },
            { 
                status: 'Rejected',
                message: 'BOQ revision has been rejected'
            }
        );

        // Add signature and remarks
        await addSignatureAndRemarks(
            id,
            req.user.roleId,
            boq.levelId,
            remarks,
            req.user._id,
            req.user.userName
        );

        // Return the BOQ to its previous accepted state if it exists
        const rateHistory = await BOQRateHistory.find({ boqId: id });
        if (rateHistory.length > 0) {
            for (const item of rateHistory) {
                const previousRate = item.rates[item.rates.length - 2]; // Get second-to-last rate
                if (previousRate) {
                    // Find and update the corresponding BOQ item
                    const boqItem = boq.items.find(i => i.itemCode === item.itemCode);
                    if (boqItem) {
                        boqItem.unitRate = previousRate.rate;
                        boqItem.amount = boqItem.qty * previousRate.rate;
                    }
                }
            }
            
            // Recalculate total amount
            boq.totalAmount = boq.items.reduce((sum, item) => sum + (item.amount || 0), 0);
            await boq.save();
        }

        return res.json({
            success: true,
            message: 'BOQ revision rejected successfully',
            boq
        });
    } catch (error) {
        console.error('Error in rejectBOQRevision:', error);
        res.status(500).json({ 
            success: false,
            error: error.message,
            message: 'Failed to reject BOQ revision'
        });
    }
};
const getPreviousRates = async (req, res) => {
    try {
        const { boqId } = req.params;

        // Find all rate histories for this BOQ
        const rateHistories = await BOQRateHistory.find({ boqId });
        if (!rateHistories.length) {
            return res.status(404).json({
                success: false,
                message: 'No rate history found for this BOQ'
            });
        }

        // Get the BOQ to match items with their histories
        const boq = await BOQ.findById(boqId);
        if (!boq) {
            return res.status(404).json({
                success: false,
                message: 'BOQ not found'
            });
        }

        // Create a map of previous rates for each item
        const previousRates = boq.items.map(item => {
            const rateHistory = rateHistories.find(history => 
                history.itemCode === item.itemCode
            );

            if (!rateHistory || rateHistory.rates.length < 2) {
                return {
                    itemId: item._id,
                    itemCode: item.itemCode,
                    currentRate: item.unitRate,
                    previousRate: item.unitRate, // If no history, current rate is the only rate
                    hasHistory: false
                };
            }

            // Get the previous rate (second to last in the rates array)
            const previousRate = rateHistory.rates[rateHistory.rates.length - 2];

            return {
                itemId: item._id,
                itemCode: item.itemCode,
                currentRate: item.unitRate,
                previousRate: previousRate.rate,
                revisionNumber: previousRate.revisionNumber,
                hasHistory: true
            };
        });

        res.json({
            success: true,
            data: previousRates
        });

    } catch (error) {
        console.error('Error in getPreviousRates:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to get previous rates'
        });
    }
};

const getAllRateHistory = async (req, res) => {
    try {
        const { boqId } = req.params;

        // Validate BOQ existence
        const boq = await BOQ.findById(boqId);
        if (!boq) {
            return res.status(404).json({
                success: false,
                message: 'BOQ not found'
            });
        }

        // Get all rate histories for this BOQ
        const rateHistories = await BOQRateHistory.find({ boqId })
            .sort('itemCode')
            .lean();

        if (!rateHistories.length) {
            return res.status(404).json({
                success: false,
                message: 'No rate history found for this BOQ'
            });
        }

        // Create detailed history for each item
        const detailedHistory = rateHistories.map(history => {
            // Find corresponding BOQ item
            const boqItem = boq.items.find(item => item.itemCode === history.itemCode);
            
            // Calculate rate changes between revisions
            const rateChanges = history.rates.map((rate, index) => {
                if (index === 0) {
                    return {
                        change: 0,
                        changePercentage: 0
                    };
                }

                const previousRate = history.rates[index - 1].rate;
                const change = rate.rate - previousRate;
                const changePercentage = ((change / previousRate) * 100).toFixed(2);

                return {
                    change,
                    changePercentage
                };
            });

            // Combine rates with their changes
            const revisionsWithChanges = history.rates.map((rate, index) => ({
                revisionNumber: rate.revisionNumber,
                rate: rate.rate,
                change: rateChanges[index].change,
                changePercentage: rateChanges[index].changePercentage,
                timestamp: rate._id.getTimestamp()
            }));

            return {
                itemCode: history.itemCode,
                itemName: boqItem?.name || 'Item not found',
                itemDescription: boqItem?.description || 'Description not available',
                unit: boqItem?.unit || 'N/A',
                currentRate: boqItem?.unitRate || 0,
                totalRevisions: history.rates.length - 1, // Excluding initial rate
                revisions: revisionsWithChanges,
                firstRecordedAt: history.createdAt,
                lastUpdatedAt: history.updatedAt
            };
        });

        // Calculate summary statistics
        const summary = {
            totalItems: detailedHistory.length,
            averageRevisions: (detailedHistory.reduce((sum, item) => 
                sum + item.totalRevisions, 0) / detailedHistory.length).toFixed(2),
            itemsWithMultipleRevisions: detailedHistory.filter(
                item => item.totalRevisions > 0
            ).length,
            lastUpdated: new Date(Math.max(...detailedHistory.map(
                item => new Date(item.lastUpdatedAt)
            )))
        };

        res.json({
            success: true,
            summary,
            data: detailedHistory
        });

    } catch (error) {
        console.error('Error in getAllRateHistory:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to retrieve rate history'
        });
    }
};







module.exports = {
    getAcceptedBOQs,
    updateBOQRates,
    getBOQsForRevisionVerification,
    verifyBOQRevision,
    rejectBOQRevision,
    getPreviousRates,
    getAllRateHistory
}