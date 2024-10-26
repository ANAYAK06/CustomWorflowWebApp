const mongoose = require('mongoose');
const { setBalanceType } = require('../hooks/accountsLedgerHelper')
const AccountsLedger = require('../models/accountsLedgerModel')
const Permission = require('../models/permissionModel');
const notificationEmitter = require('../notificationEmitter');
const NotificationHub = require('../models/notificationHubModel');
const User = require('../models/usersModel');
const UserRoles = require('../models/userRolesModel')
const { addSignatureAndRemarks, getSignatureandRemakrs } = require('./signatureAndRemarks');


const checkLedgerNameExists = async( req, res) => {
    try {
        const {ledgerName} = req.query
        if(!ledgerName){
            return res.status(400).json({message: "Ledger name required"})
        }   

        const existingLedger = await AccountsLedger.findOne({ledgerName: {$regex: new RegExp(`${ledgerName}$`,'i')}})

        if(existingLedger){
            return res.json({exists: true, message: 'Ledger Name is already exists'})
        } else {
        return res.json({exists:false, message: 'Ledger Name is available'})
        }
    } catch (error) {
        console.error('Error checking ledger name:', error);
        res.status(500).json({ message: 'An error occurred while checking the ledger name', error: error.message });
        
    }
}


const createGeneralLedger = async (req, res) => {
    try {
        const { ledgerName, groupId, openingBalance, isTDSApplicable, isTCSApplicable, isGSTApplicable, remarks, balanceType, balanceAsOn } = req.body;

        const existingLedger =  await AccountsLedger.findOne({ ledgerName: { $regex: new RegExp(`^${ledgerName}$`, 'i') } })
        if(existingLedger){
            return res.status(400).json({message: "Ledger Name already exists"})

        }
     

        const newLedger = new AccountsLedger({
            ledgerName,
            groupId,
            openingBalance,
            isTCSApplicable,
            isTDSApplicable,
            isGSTApplicable,
            balanceType:balanceType || await setBalanceType(groupId),
            balanceAsOn:balanceAsOn || new Date(),
            status: 'Verification',
            levelId:1
        })

       
        await newLedger.save()
        
        await addSignatureAndRemarks(newLedger._id, req.user.roleId, 1, remarks, req.user._id, req.user.userName)

        const permission = await Permission.findOne({workflowId:136})
        if(!permission){
            return res.status(404).json({message: "workflow not found"})
        }

        const workflowDetail = permission.workflowDetails.find(detail => detail.levelId === 1)
        if(!workflowDetail) {
            return res.status(404).json({message:' workflow detail not found'})
        }

        const newNotification = new NotificationHub({
            workflowId:136,
            roleId:workflowDetail.roleId,
            pathId:workflowDetail.pathId,
            levelId:1,
            relatedEntityId:newLedger._id,
            message: `New Ledger Created: ${ledgerName}`,
            status:'Pending'
        })
        await newNotification.save()

        notificationEmitter.emit('notification', {
            userRoleId: workflowDetail.roleId,
            count:1
        })

        res.status(201).json({
            message: 'Ledger Created successfully and sent for verification',
            ledger:newLedger,
            notificaton: newNotification
        })

    } catch (error) {
        res.status(500).json({ message: 'An error occurred while creating the ledger', error: error.message });
        throw error

    }
}

const getGeneralLedgerForVerification = async (req, res) => {
    const userRoleId = parseInt(req.query.userRoleId);
    try {
        if (isNaN(userRoleId)) {
            return res.status(400).json({ message: 'Invalid userRoleId provided' });
        }

        const userRole = await UserRoles.findOne({ roleId: userRoleId });
        if (!userRole) {
            return res.status(404).json({ message: 'User role not found' });
        }

        const permission = await Permission.findOne({ workflowId: 136 });
        if (!permission) {
            return res.status(404).json({ message: 'Workflow not found' });
        }

        const relevantWorkflowDetails = permission.workflowDetails.filter(
            detail => detail.roleId === userRoleId
        );

        if (relevantWorkflowDetails.length === 0) {
            // User doesn't have access to this workflow
            return res.status(403).json({ 
                message: 'Access denied', 
                reason: 'No matching workflow details found for this role',
                ledgers: []
            });
        }

        const notifications = await NotificationHub.find({
            workflowId: 136,
            roleId: userRoleId,
            pathId: { $in: relevantWorkflowDetails.map(detail => detail.pathId) },
            status: 'Pending'
        });

        if (!notifications.length) {
            // No pending notifications, but this is not an error
            return res.status(200).json({ 
                message: 'No pending items for verification', 
                reason: 'No pending notifications available',
                ledgers: []
            });
        }

        const ledgerIds = notifications.map(notification => notification.relatedEntityId);

        let ledgerQuery = {
            _id: { $in: ledgerIds },
            status: 'Verification',
            levelId: { $in: relevantWorkflowDetails.map(detail => detail.levelId) }
        };

        const ledgers = await AccountsLedger.find(ledgerQuery);

        if (!ledgers.length) {
            // No ledgers found, but this is not an error
            return res.status(200).json({ 
                message: 'No items to verify', 
                reason: 'No ledgers found for verification',
                ledgers: []
            });
        }

        const ledgerWithSignatures = await Promise.all(ledgers.map(async (ledger) => {
            const signatureAndRemarks = await getSignatureandRemakrs(ledger._id)
            return {
                ...ledger.toObject(),
                signatureAndRemarks
            }
        }));

        res.status(200).json({ 
            message: 'Ledgers retrieved successfully',
            ledgers: ledgerWithSignatures
        });

    } catch (error) {
        console.error('Error fetching general ledgers for verification:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
}

const updateGeneralLedger = async (req, res) => {

    try {

        
        const {id} = req.params;
        const {remarks} = req.body

        const ledger = await AccountsLedger.findById(id)

        if(!ledger){
            return res.status(200).json({message: "No leger available for verification"})
        }

        const {levelId} = ledger
        const permission = await Permission.findOne({workflowId:136})
        if(!permission){
            return res.status(403).json({message: 'Permission not found'})
        }

        const {workflowDetails} = permission
        const currentRoleDetail = workflowDetails.find(detail => detail.levelId === levelId);
        const nextRoleDetail = workflowDetails.find(detail => detail.levelId === levelId + 1)

        await addSignatureAndRemarks(id, req.user.roleId, levelId, remarks, req.user._id, req.user.userName);

        if(nextRoleDetail) {
            ledger.levelId = nextRoleDetail.levelId
            await ledger.save()

            await NotificationHub.findOneAndUpdate(
                {relatedEntityId:id},
                {
                    levelId:nextRoleDetail.levelId,
                    roleId:nextRoleDetail.roleId,
                    pathId:nextRoleDetail.pathId,
                    status: 'Pending'
                }
            )

            notificationEmitter.emit('notification', {
                userRoleId: nextRoleDetail.roleId,
                count: 1
            });

            return res.status(200).json({ message: "Ledger updated to next level", ledger })
        } else {
            ledger.status = 'Approved';
            await ledger.save();

            await NotificationHub.findOneAndUpdate(
                {relatedEntityId:id},
                {status:'Approved'}
            )
            return res.status(200).json({ message: "Ledger Approved Successfully" });
        }

        



    } catch (error) {
        res.status(500).json({ message: 'An error occurred while updating the ledger', error: error.message });
        
    }
}

const rejectLedger = async (req, res) => {
    try {
        const { id, remarks } = req.body;

        const ledger = await AccountsLedger.findOne({ _id: id, status: 'Verification' });

        if (!ledger) {
            return res.status(404).json({ message: 'No Ledger found for verification' });
        }

        const { _id, levelId } = ledger;

        ledger.status = 'Rejected';
        await ledger.save();

        // Update the existing notification
        await NotificationHub.findOneAndUpdate(
            { relatedEntityId: _id },
            { status: 'Rejected' }
        );

        // Add signature and remarks
        await addSignatureAndRemarks(_id, req.user.roleId, levelId, remarks, req.user._id, req.user.userName);

        return res.status(200).json({ message: 'Ledger rejected successfully' });
    } catch (error) {
        console.error('Error rejecting Ledger:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};


module.exports = { createGeneralLedger, 
    updateGeneralLedger,
checkLedgerNameExists,
getGeneralLedgerForVerification,
rejectLedger }
