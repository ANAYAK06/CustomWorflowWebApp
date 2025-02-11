const CostCentre = require('../models/costCentreModel')
const Permission = require('../models/permissionModel')
const notificationEmitter = require('../notificationEmitter')
const NotificationHub = require('../models/notificationHubModel')
const CCBudget = require('../models/ccBudgetModel')
const { addSignatureAndRemarks, getSignatureandRemakrs } = require('./signatureAndRemarks');
const mongoose = require('mongoose')



//Create new cost Centre
const createNewCostCentre = async (req, res) => {
    try {
        const {
            ccType,
            subCCType,
            ccNo,
            ccName,
            location,
            address,
            projectHandling,
            client,
            contact,
            finalOfferRef,
            finalAcceptanceRef,
            dayLimit,
            voucherLimit,
            remarks
        } = req.body

        const prefixedCcNo = `CC-${ccNo}`

        // Check if CC number already exists
        const existingCostCentre = await CostCentre.findOne({ ccNo: prefixedCcNo })
        if (existingCostCentre) {
            return res.status(400).json({ message: 'CC Number Already taken' })
        }

        // Check if CC name already exists
        const existingCCName = await CostCentre.findOne({ ccName: { $regex: new RegExp(`^${ccName}$`, 'i') } })
        if (existingCCName) {
            return res.status(400).json({ message: "Name already existing" })
        }

        // Create new cost centre
        const newCostCentre = new CostCentre({
            ccType,
            subCCType,
            ccNo: prefixedCcNo,
            ccName,
            location,
            address,
            projectHandling,
            client,
            contact,
            finalOfferRef,
            finalAcceptanceRef,
            dayLimit,
            voucherLimit,
            status: 'Verification',
            levelId: 1
        });
        await newCostCentre.save()

        // Add signature and remarks
        await addSignatureAndRemarks(newCostCentre._id, req.user.roleId, 1, remarks, req.user._id, req.user.userName)

        // Fetch workflow details
        const permission = await Permission.findOne({ workflowId: 128 })
        if (!permission) {
            return res.status(404).json({ message: 'Permission not found' })
        }

        const { workflowId, workflowDetails } = permission
        const workflowDetail = workflowDetails.find(detail => detail.levelId === 1);
        if (!workflowDetail) {
            return res.status(404).json({ message: 'Workflow details not found' })
        }

        // Create notification
        const newNotification = new NotificationHub({
            workflowId,
            roleId: workflowDetail.roleId,
            pathId: workflowDetail.pathId,
            levelId: 1,
            relatedEntityId: newCostCentre._id,
            message: `New Cost Centre Created: ${ccName}`,
            status: 'Pending'
        })
        await newNotification.save()

        // Emit notification
        notificationEmitter.emit('notification', {
            userRoleId: workflowDetail.roleId,
            count: 1
        })

        res.status(201).json({
            message: 'Cost Centre Created successfully and sent for verification',
            costCentre: newCostCentre,
            notification: newNotification
        })

    } catch (error) {
        console.error('Error creating cost centre:', error)
        res.status(500).json({ message: 'Server error', error: error.message });
    }
}

// get All CC Data

// Controller for getting all cost centre data
const getAllCostCentreData = async (req, res) => {
    try {
        const CCDetails = await CostCentre.find({})
            .sort({ createdAt: -1 })
            .lean(); // Use lean() for better performance since we don't need Mongoose document methods

        if (!CCDetails) {
            return res.status(404).json({ 
                success: false, 
                message: 'No cost centres found' 
            });
        }

        res.status(200).json({
            success: true,
            data: CCDetails,
            count: CCDetails.length
        });
    } catch (error) {
        console.error('Error fetching cost centres:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching cost centres',
            error: error.message 
        });
    }
};

const getAllCCCode = async (req, res) => {
    try {
        console.log('Fetching CC codes for dropdown');
        
        const CCCodes = await CostCentre.find(
            { status: "Approved" },
            { 
                ccNo: 1,
                ccName: 1,
                location: 1,
                _id: 1
            }
        ).lean().sort({ createdAt: -1 });

        console.log(`Found ${CCCodes.length} approved cost centers`);

        if (!CCCodes || CCCodes.length === 0) {
            return res.status(200).json({  // Changed to 200 with empty array
                success: true,
                data: []
            });
        }

        const formattedCCCodes = CCCodes.map(cc => ({
            value: cc.ccNo,
            label: `${cc.ccNo} - ${cc.ccName}`,
            location: cc.location,
            id: cc._id.toString()  // Convert ObjectId to string
        }));

        console.log('Sending formatted CC codes:', formattedCCCodes);

        return res.status(200).json({
            success: true,
            data: formattedCCCodes
        });
        
    } catch (error) {
        console.error('Error fetching cost centre codes:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};


// get new CC Data for verification next level 
const getCCDataforVerification = async (req, res) => {
    const userRoleId = parseInt(req.query.userRoleId);
    try {
        const permission = await Permission.findOne({ workflowId: 128 });
        if (!permission) {
            return res.status(404).json({ message: 'Workflow not found' });
        }

        const relevantWorkflowDetails = permission.workflowDetails.filter(
            detail => detail.roleId === userRoleId
        );

        if (relevantWorkflowDetails.length === 0) {
            return res.status(404).json({ message: 'No matching workflow details found' });
        }

        const notifications = await NotificationHub.find({
            workflowId: 128,
            roleId: userRoleId,
            pathId: { $in: relevantWorkflowDetails.map(detail => detail.pathId) },
            status: 'Pending'
        });

        if (!notifications.length) {
            return res.status(200).json({ message: 'No Pending Notification available', costCentres: [] });
        }

        const costCentreIds = notifications.map(notification => notification.relatedEntityId);

        const costCentres = await CostCentre.find({
            _id: { $in: costCentreIds },
            status: 'Verification',
            levelId: { $in: relevantWorkflowDetails.map(detail => detail.levelId) }
        });

        if (!costCentres.length) {
            return res.status(200).json({ message: 'No cost centre data for verification', costCentres: [] });
        }

        const costCentresWithSignatures = await Promise.all(costCentres.map(async (cc) => {
            const signatureAndRemarks = await getSignatureandRemakrs(cc._id);
            return {
                ...cc.toObject(),
                signatureAndRemarks
            };
        }));

        res.status(200).json({ costCentres: costCentresWithSignatures });
    } catch (error) {
        console.error('Error fetching cost centers for verification:', error);
        res.status(500).json({ message: 'Server error', error });
    }
};


//update cost centre
const updateCostCentre = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        const costCentre = await CostCentre.findById(id);
        if (!costCentre) {
            return res.status(404).json({ message: "No cost centre for verification" });
        }

        const { levelId } = costCentre;
        const permission = await Permission.findOne({ workflowId: 128 });
        if (!permission) {
            return res.status(404).json({ message: 'Permission not found' });
        }

        const { workflowDetails } = permission;
        const currentRoleDetail = workflowDetails.find(detail => detail.levelId === levelId);
        const nextRoleDetail = workflowDetails.find(detail => detail.levelId === levelId + 1);

        await addSignatureAndRemarks(id, req.user.roleId, levelId, remarks, req.user._id, req.user.userName);

        if (nextRoleDetail) {
            costCentre.levelId = nextRoleDetail.levelId;
            await costCentre.save();

            await NotificationHub.findOneAndUpdate(
                { relatedEntityId: id },
                {
                    levelId: nextRoleDetail.levelId,
                    roleId: nextRoleDetail.roleId,
                    pathId: nextRoleDetail.pathId,
                    status: 'Pending'
                }
            );

            notificationEmitter.emit('notification', {
                userRoleId: nextRoleDetail.roleId,
                count: 1
            });

            return res.status(200).json({ message: 'Cost Centre updated to next level', costCentre });
        } else {
            costCentre.status = 'Approved';
            await costCentre.save();

            await NotificationHub.findOneAndUpdate(
                { relatedEntityId: id },
                { status: 'Approved' }
            );

            return res.status(200).json({ message: 'Cost Centre Approved Successfully' });
        }
    } catch (error) {
        console.error('Error updating cost centre:', error);
        res.status(500).json({ message: 'Server error', error });
    }
};

// check cost centre number exists

const checkCCNoExists = async(req,res)=>{
    const {ccNo} =req.params;

    try {
        const costCentre = await CostCentre.findOne({ccNo})
        if(costCentre){
            res.json({exists:true})
        }else{
            res.json({exists:false})
        }
        
    } catch (error) {
        console.error('Error checking cost centre number:', error);
        res.status(500).json({ message: 'Server error' });
        
    }
}

// Reject Cost Centre
const rejectCostCentre = async (req, res) => {
    try {
        const {id} = req.params
        const {remarks } = req.body;

        const costCentre = await CostCentre.findOne({ _id: id, status: 'Verification' });
        if (!costCentre) {
            return res.status(404).json({ message: 'Cost Centre not found for verification' });
        }

        const { levelId } = costCentre;

        costCentre.status = 'Rejected';
        await costCentre.save();

        await NotificationHub.findOneAndUpdate(
            { relatedEntityId: id },
            { status: 'Rejected' }
        );

        await addSignatureAndRemarks(id, req.user.roleId, levelId, remarks, req.user._id, req.user.userName);

        res.status(200).json({ message: 'Cost Centre rejected successfully' });
    } catch (error) {
        console.error('Error rejecting cost centre:', error);
        res.status(500).json({ message: 'Server error', error });
    }
};

// Get an eligible cost centre for  CC Budget Assign 

const getEligibleCCForBudgetAssign  = async(req, res) => {
    try {
        const {ccid, subId, fiscalYear} = req.query

        const approvedCCs = await CostCentre.find({
            ccType:ccid,
            subCCType:subId,
            status:'Approved'
        })

        const eligibleCCs = await Promise.all(approvedCCs.map(async (cc) => {
            const pendingBudget = await CCBudget.findOne({
                ccNo: cc.ccNo,
                status:'Verification'
            })
            if(pendingBudget) return null

            const approvedBudgetWithoutFY = await CCBudget.findOne({
                ccNo:cc.ccNo,
                status:'Approved',
                applyFiscalYear:false


            })
            if(approvedBudgetWithoutFY) return null

            if(fiscalYear){
                const existingBudgetForFY = await CCBudget.findOne({
                    ccNo: cc.ccNo,
                    fiscalYear,
                    status:'Approved'
                })
                if(existingBudgetForFY) return null
            }
            return {
                value:cc.ccNo,
                label: `${cc.ccNo} - ${cc.ccName}`
            }
        }))
        const filteredEligibleCC = eligibleCCs.filter(cc => cc !== null)

        res.json(filteredEligibleCC)

    } catch (error) {
        res.status(500).json({ message: 'Error fetching eligible cost centers', error: error.message });
    }
}

module.exports = {
    createNewCostCentre,
    getAllCostCentreData,
    getCCDataforVerification,
    updateCostCentre,
    checkCCNoExists,
    rejectCostCentre,
    getEligibleCCForBudgetAssign,
    getAllCCCode
}