const mongoose = require('mongoose');
const TDS = require('../models/tdsmodel');
const Permission = require('../models/permissionModel');
const notificationEmitter = require('../notificationEmitter');
const NotificationHub = require('../models/notificationHubModel');
const AccountsLedger = require('../models/accountsLedgerModel');
const { addSignatureAndRemarks, getSignatureandRemakrs } = require('./signatureAndRemarks');

/**
 * Check if TDS account name already exists
 */
const checkTdsAccountExists = async (req, res) => {
    try {
        const { tdsAccountName } = req.query;
        if (!tdsAccountName) {
            return res.status(400).json({ message: "TDS account name required" });
        }

        const existingAccount = await TDS.findOne({ 
            tdsAccountName: { $regex: new RegExp(`^${tdsAccountName}$`, 'i') }
        });

        if (existingAccount) {
            return res.json({ 
                exists: true, 
                message: 'TDS account name already exists' 
            });
        }
        return res.json({ 
            exists: false, 
            message: 'TDS account name is available' 
        });
    } catch (error) {
        console.error('Error checking TDS account:', error);
        res.status(500).json({ 
            message: 'An error occurred while checking the TDS account', 
            error: error.message 
        });
    }
};

/**
 * Create new TDS account
 */
const createTdsAccount = async (req, res) => {
    try {
        const {
            tdsAccountName,
            tdsAccountSec,
            accountingGroupId,
            openingBalance,
            openingBalanceAsOn,
            taxRules,
            remarks
        } = req.body;

        // Validate required fields
        if (!tdsAccountName || !tdsAccountSec || !accountingGroupId || !taxRules) {
            return res.status(400).json({
                message: "TDS account name, section, accounting group, and tax rules are required"
            });
        }

        // Validate tax rules
        if (!taxRules.individual || !taxRules.huf || !taxRules.companiesAndFirms || !taxRules.others) {
            return res.status(400).json({
                message: "All tax rules (individual, HUF, companies & firms, others) are required"
            });
        }

        // Check if account name already exists
        const existingAccount = await TDS.findOne({
            tdsAccountName: { $regex: new RegExp(`^${tdsAccountName}$`, 'i') }
        });

        if (existingAccount) {
            return res.status(400).json({ message: "TDS account name already exists" });
        }

        // Validate accounting group exists
        const accountGroup = await mongoose.model('accountgroup').findById(accountingGroupId);
        if (!accountGroup) {
            return res.status(400).json({ message: "Invalid accounting group" });
        }

        // Create new TDS account
        const newTdsAccount = new TDS({
            tdsAccountName,
            tdsAccountSec,
            accountingGroupId,
            openingBalance: openingBalance || 0,
            openingBalanceAsOn: openingBalanceAsOn ? new Date(openingBalanceAsOn) : new Date(),
            taxRules,
            status: 'Verification',
            levelId: 1,
            createdBy: req.user._id
        });

        await newTdsAccount.save();

        // Add signature and remarks
        await addSignatureAndRemarks(
            newTdsAccount._id,
            req.user.roleId,
            0,
            remarks,
            req.user._id,
            req.user.userName
        );

        // Get workflow permission for TDS (workflowId: 142)
        const permission = await Permission.findOne({ workflowId: 142 });
        if (!permission) {
            return res.status(404).json({ message: "Workflow not found" });
        }

        const workflowDetail = permission.workflowDetails.find(detail => detail.levelId === 1);
        if (!workflowDetail) {
            return res.status(404).json({ message: 'Workflow detail not found' });
        }

        // Create notification
        const newNotification = new NotificationHub({
            workflowId: 142,
            roleId: workflowDetail.roleId,
            pathId: workflowDetail.pathId,
            levelId: 1,
            relatedEntityId: newTdsAccount._id,
            message: `New TDS Account Created: ${tdsAccountName}`,
            status: 'Pending'
        });
        await newNotification.save();

        // Emit notification
        notificationEmitter.emit('notification', {
            userRoleId: workflowDetail.roleId,
            count: 1
        });

        res.status(201).json({
            message: 'TDS account created successfully and sent for verification',
            tdsAccount: newTdsAccount,
            notification: newNotification
        });

    } catch (error) {
        console.error('TDS Account Creation Error:', error);
        res.status(500).json({
            message: 'An error occurred while creating the TDS account',
            error: error.message
        });
    }
};

/**
 * Get TDS accounts for verification
 */
const getTdsAccountsForVerification = async (req, res) => {
    const userRoleId = parseInt(req.query.userRoleId);
    try {
        if (isNaN(userRoleId)) {
            return res.status(400).json({ message: 'Invalid userRoleId provided' });
        }

        // Verify workflow and permissions
        const permission = await Permission.findOne({ workflowId: 142 });
        if (!permission) {
            return res.status(404).json({ message: 'Workflow not found' });
        }

        const relevantWorkflowDetails = permission.workflowDetails.filter(
            detail => detail.roleId === userRoleId
        );

        if (relevantWorkflowDetails.length === 0) {
            return res.status(403).json({
                message: 'Access denied: No matching workflow details found for this role',
                tdsAccounts: []
            });
        }

        // Get relevant notifications
        const notifications = await NotificationHub.find({
            workflowId: 142,
            roleId: userRoleId,
            pathId: { $in: relevantWorkflowDetails.map(detail => detail.pathId) },
            status: 'Pending'
        });

        if (!notifications.length) {
            return res.status(200).json({
                message: 'No pending items for verification',
                tdsAccounts: []
            });
        }

        const accountIds = notifications.map(notification => notification.relatedEntityId);

        // Get TDS accounts with pending verification
        const tdsAccounts = await TDS.find({
            _id: { $in: accountIds },
            status: 'Verification',
            levelId: { $in: relevantWorkflowDetails.map(detail => detail.levelId) }
        })

        // Get signatures and remarks for each account
        const accountsWithSignatures = await Promise.all(tdsAccounts.map(async (account) => {
            const signatureAndRemarks = await getSignatureandRemakrs(account._id);
            return {
                ...account.toObject(),
                signatureAndRemarks
            };
        }));

        res.status(200).json({
            success: true,
            message: 'TDS accounts retrieved successfully',
            tdsAccounts: accountsWithSignatures
        });

    } catch (error) {
        console.error('Error fetching TDS accounts for verification:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error', 
            error: error.message 
        });
    }
};

/**
 * Update TDS account status (approve/move to next level)
 */
const updateTdsAccount = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        if (!remarks) {
            return res.status(400).json({
                message: "Remarks are required for verification"
            });
        }

        const tdsAccount = await TDS.findById(id);
        if (!tdsAccount) {
            return res.status(404).json({ 
                message: "No TDS account found for verification" 
            });
        }

        const { levelId } = tdsAccount;
        const permission = await Permission.findOne({ workflowId: 142 });
        if (!permission) {
            return res.status(403).json({ message: 'Permission not found' });
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

        const nextRoleDetail = permission.workflowDetails.find(
            detail => detail.levelId === levelId + 1
        );

        if (nextRoleDetail) {
            // Move to next level
            const updatedTdsAccount = await TDS.findByIdAndUpdate(
                id,
                { 
                    levelId: nextRoleDetail.levelId,
                    updatedBy: req.user._id 
                },
                { new: true }
            );

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

            return res.status(200).json({
                success: true,
                message: "TDS account updated to next level",
                tdsAccount: updatedTdsAccount
            });
        } else {
            // Final approval
            // Verify accounting group
            const accountGroup = await mongoose.model('accountgroup').findById(tdsAccount.accountingGroupId);
            if (!accountGroup) {
                return res.status(400).json({
                    message: "Invalid accounting group ID for ledger creation"
                });
            }

            // Update TDS account status
            const updatedTdsAccount = await TDS.findByIdAndUpdate(
                id,
                { 
                    status: 'Approved',
                    updatedBy: req.user._id 
                },
                { new: true }
            );

            // Create ledger entry
            const ledgerEntry = new AccountsLedger({
                ledgerId: tdsAccount._id,
                ledgerName: `TDS - ${tdsAccount.tdsAccountName}`,
                groupId: accountGroup._id,
                openingBalance: tdsAccount.openingBalance,
                balanceType: 'Cr',
                balanceAsOn: tdsAccount.openingBalanceAsOn,
                status: 'Approved',
                levelId: tdsAccount.levelId,
               
            });

            await ledgerEntry.save();

            // Update notification status
            await NotificationHub.findOneAndUpdate(
                { relatedEntityId: id },
                { status: 'Approved' }
            );

            return res.status(200).json({
                success: true,
                message: "TDS account approved and ledger created successfully",
                tdsAccount: updatedTdsAccount,
                ledger: ledgerEntry
            });
        }

    } catch (error) {
        console.error('TDS account update error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while updating the TDS account',
            error: error.message
        });
    }
};

/**
 * Reject TDS account
 */
const rejectTdsAccount = async (req, res) => {
    try {
        const { id, remarks } = req.body;

        if (!remarks) {
            return res.status(400).json({
                message: "Remarks are required for rejection"
            });
        }

        const tdsAccount = await TDS.findOne({ 
            _id: id, 
            status: 'Verification' 
        });

        if (!tdsAccount) {
            return res.status(404).json({ 
                message: 'No TDS account found for verification' 
            });
        }

        const { _id, levelId } = tdsAccount;

        // Update TDS account status
        tdsAccount.status = 'Rejected';
        tdsAccount.updatedBy = req.user._id;
        await tdsAccount.save();

        // Update notification status
        await NotificationHub.findOneAndUpdate(
            { relatedEntityId: _id },
            { status: 'Rejected' }
        );

        // Add signature and remarks
        await addSignatureAndRemarks(
            _id, 
            req.user.roleId, 
            levelId, 
            remarks, 
            req.user._id, 
            req.user.userName
        );

        return res.status(200).json({ 
            success: true,
            message: 'TDS account rejected successfully' 
        });
    } catch (error) {
        console.error('Error rejecting TDS account:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error', 
            error: error.message 
        });
    }
};

/**
 * Get all approved TDS accounts (simple version)
 */
const getAllTdsaccount = async (req, res) => {
    try {
        const tdsAccounts = await TDS.find({ status: 'Approved' })
            .select('tdsAccountName tdsAccountSec taxRules')
            .lean();

        res.status(200).json({
            success: true,
            tdsAccounts
        });
    } catch (error) {
        console.error('Error fetching TDS accounts:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching TDS accounts',
            error: error.message
        });
    }
};

module.exports = {
    createTdsAccount,
    updateTdsAccount,
    checkTdsAccountExists,
    getTdsAccountsForVerification,
    rejectTdsAccount,
    getAllTdsaccount
};