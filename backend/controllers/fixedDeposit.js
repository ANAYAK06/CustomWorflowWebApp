const mongoose = require('mongoose');
const FixedDeposit = require('../models/fixedDepositModel');
const Permission = require('../models/permissionModel');
const notificationEmitter = require('../notificationEmitter');
const NotificationHub = require('../models/notificationHubModel');
const AccountsLedger = require('../models/accountsLedgerModel');
const BankDetails = require('../models/bankAccountModel');
const { addSignatureAndRemarks, getSignatureandRemakrs } = require('./signatureAndRemarks');

const checkFDAccountExists = async (req, res) => {
    try {
        const { accountNumber } = req.query;
        if (!accountNumber) {
            return res.status(400).json({ message: "Account number required" });
        }

        const existingFD = await FixedDeposit.findOne({ 
            accountNumber: { $regex: new RegExp(`^${accountNumber}$`, 'i') }
        });

        return res.json({ 
            exists: !!existingFD, 
            message: existingFD ? 'Account number already exists' : 'Account number is available' 
        });
    } catch (error) {
        console.error('Error checking account number:', error);
        res.status(500).json({ 
            message: 'An error occurred while checking the account number', 
            error: error.message 
        });
    }
};
const createFixedDeposit = async (req, res) => {
    try {
        const {
            fdType,
            updateType,
            bankName,
            accountNumber,
            depositAmount,
            tenure,
            rateOfInterest,
            interestPayout,
            depositDate,
            linkedBankAccount,
            accountingGroupId,
            autoRenewal,
            fdBalance,
            balanceAsOn,
            remarks
        } = req.body;

        // Validate required fields
        if (!depositDate || !accountingGroupId || !updateType) {
            return res.status(400).json({
                message: "Deposit date, accounting group, and update type are required"
            });
        }

        // Additional validation for existing FDs
        if (updateType === 'existing' && (!fdBalance || !balanceAsOn)) {
            return res.status(400).json({
                message: "FD balance and balance as on date are required for existing FDs"
            });
        }

        // Check if account number exists
        const existingFD = await FixedDeposit.findOne({
            accountNumber: { $regex: new RegExp(`^${accountNumber}$`, 'i') }
        });

        if (existingFD) {
            return res.status(400).json({ message: "Account number already exists" });
        }

        // Calculate maturity date
        const depositDateObj = new Date(depositDate);
        const maturityDate = new Date(depositDateObj);
        maturityDate.setFullYear(maturityDate.getFullYear() + (tenure.years || 0));
        maturityDate.setMonth(maturityDate.getMonth() + (tenure.months || 0));
        maturityDate.setDate(maturityDate.getDate() + (tenure.days || 0));

        // Calculate maturity amount
        const timeInYears = tenure.years + (tenure.months / 12) + (tenure.days / 365);
        let maturityAmount;

        if (interestPayout === 'cumulative') {
            // Compound interest calculation (quarterly compounding)
            const rate = rateOfInterest / 100;
            maturityAmount = depositAmount * Math.pow(1 + (rate / 4), 4 * timeInYears);
        } else {
            // Simple interest calculation
            maturityAmount = depositAmount * (1 + (rateOfInterest / 100) * timeInYears);
        }

        // Create new fixed deposit
        const newFD = new FixedDeposit({
            fdType,
            updateType,
            bankName,
            accountNumber,
            depositAmount,
            tenure,
            rateOfInterest,
            interestPayout,
            depositDate: new Date(depositDate),
            maturityDate, // Add calculated maturity date
            maturityAmount: Math.round(maturityAmount), // Add calculated maturity amount
            linkedBankAccount,
            accountingGroupId,
            autoRenewal,
            verificationStatus: 'Verification',
            levelId: 1,
            status: 'active'
        });

        // Set balance fields based on update type
        if (updateType === 'existing') {
            newFD.fdBalance = fdBalance;
            newFD.balanceAsOn = new Date(balanceAsOn);
        } else {
            newFD.fdBalance = depositAmount;
            newFD.balanceAsOn = new Date(depositDate);
        }

        await newFD.save();

        // Add signature and remarks
        await addSignatureAndRemarks(
            newFD._id,
            req.user.roleId,
            0,
            remarks,
            req.user._id,
            req.user.userName
        );

        // Get workflow permission
        const permission = await Permission.findOne({ workflowId: 141 });
        if (!permission) {
            return res.status(404).json({ message: "Workflow not found" });
        }

        const workflowDetail = permission.workflowDetails.find(detail => detail.levelId === 1);
        if (!workflowDetail) {
            return res.status(404).json({ message: 'Workflow detail not found' });
        }

        // Create notification
        const newNotification = new NotificationHub({
            workflowId: 141,
            roleId: workflowDetail.roleId,
            pathId: workflowDetail.pathId,
            levelId: 1,
            relatedEntityId: newFD._id,
            message: `${updateType === 'new' ? 'New' : 'Existing'} Fixed Deposit Created: ${bankName} - ${accountNumber}`,
            status: 'Pending'
        });
        await newNotification.save();

        notificationEmitter.emit('notification', {
            userRoleId: workflowDetail.roleId,
            count: 1
        });

        res.status(201).json({
            message: `${updateType === 'new' ? 'New' : 'Existing'} fixed deposit created successfully and sent for verification`,
            fixedDeposit: newFD,
            notification: newNotification
        });

    } catch (error) {
        console.error('Fixed Deposit Creation Error:', error);
        res.status(500).json({
            message: 'An error occurred while creating the fixed deposit',
            error: error.message
        });
    }
};



const getFDSummary = async (req, res) => {
    try {
        const { id } = req.params;

        const fd = await FixedDeposit.findById(id)
            .populate('linkedBankAccount', 'bankName accountNumber')
            .populate('accountingGroupId', 'groupName');

        if (!fd) {
            return res.status(404).json({
                message: 'Fixed deposit not found'
            });
        }

        const summary = {
            depositDetails: {
                accountNumber: fd.accountNumber,
                fdType: fd.fdType,
                bankName: fd.bankName,
                status: fd.status
            },
            financialDetails: {
                depositAmount: fd.depositAmount,
                rateOfInterest: fd.rateOfInterest,
                maturityAmount: fd.maturityAmount,
                interestPayout: fd.interestPayout
            },
            tenureDetails: {
                years: fd.tenure.years,
                months: fd.tenure.months,
                days: fd.tenure.days,
                depositDate: fd.depositDate,
                maturityDate: fd.maturityDate
            },
            accountDetails: {
                linkedBankAccount: fd.linkedBankAccount ? {
                    bankName: fd.linkedBankAccount.bankName,
                    accountNumber: fd.linkedBankAccount.accountNumber
                } : null,
                accountingGroup: fd.accountingGroupId ? fd.accountingGroupId.groupName : null
            },
            autoRenewalDetails: fd.autoRenewal,
            approvalDetails: {
                status: fd.verificationStatus,
                levelId: fd.levelId
            }
        };

        res.status(200).json({
            message: 'Fixed deposit summary retrieved successfully',
            summary
        });

    } catch (error) {
        console.error('Error retrieving FD summary:', error);
        res.status(500).json({
            message: 'An error occurred while retrieving fixed deposit summary',
            error: error.message
        });
    }
};

const getFDsForVerification = async (req, res) => {
    const userRoleId = parseInt(req.query.userRoleId);
    try {
        if (isNaN(userRoleId)) {
            return res.status(400).json({ message: 'Invalid userRoleId provided' });
        }

        const permission = await Permission.findOne({ workflowId: 141 });
        if (!permission) {
            return res.status(404).json({ message: 'Workflow not found' });
        }

        const relevantWorkflowDetails = permission.workflowDetails.filter(
            detail => detail.roleId === userRoleId
        );

        if (relevantWorkflowDetails.length === 0) {
            return res.status(403).json({
                message: 'Access denied',
                fixedDeposits: []
            });
        }

        const notifications = await NotificationHub.find({
            workflowId: 141,
            roleId: userRoleId,
            pathId: { $in: relevantWorkflowDetails.map(detail => detail.pathId) },
            status: 'Pending'
        });

        if (!notifications.length) {
            return res.status(200).json({
                message: 'No pending items for verification',
                fixedDeposits: []
            });
        }

        const fdIds = notifications.map(notification => notification.relatedEntityId);

        const fixedDeposits = await FixedDeposit.find({
            _id: { $in: fdIds },
            verificationStatus: 'Verification',
            levelId: { $in: relevantWorkflowDetails.map(detail => detail.levelId) }
        }).populate('linkedBankAccount', 'bankName accountNumber');

        const fdsWithSignatures = await Promise.all(fixedDeposits.map(async (fd) => {
            const signatureAndRemarks = await getSignatureandRemakrs(fd._id);
            return {
                ...fd.toObject(),
                signatureAndRemarks
            };
        }));

        res.status(200).json({
            message: 'Fixed deposits retrieved successfully',
            fixedDeposits: fdsWithSignatures
        });

    } catch (error) {
        console.error('Error fetching FDs for verification:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
const updateFixedDeposit = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        if (!remarks || remarks.trim() === '') {
            return res.status(400).json({
                message: "Remarks are required for verification"
            });
        }

        const fd = await FixedDeposit.findById(id);
        if (!fd) {
            return res.status(404).json({ message: "No fixed deposit found for verification" });
        }

        const { levelId } = fd;
        const permission = await Permission.findOne({ workflowId: 141 });
        
        if (!permission) {
            return res.status(403).json({ message: 'Permission not found' });
        }

        const { workflowDetails } = permission;
        const nextRoleDetail = workflowDetails.find(detail => detail.levelId === levelId + 1);

        if (nextRoleDetail) {
            // Add signature and remarks before moving to next level
            await addSignatureAndRemarks(
                id, 
                req.user.roleId, 
                levelId, 
                remarks, 
                req.user._id, 
                req.user.userName
            );

            // Move to next verification level
            const updatedFD = await FixedDeposit.findByIdAndUpdate(
                id,
                { levelId: nextRoleDetail.levelId },
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
                message: "Fixed deposit moved to next verification level",
                fixedDeposit: updatedFD
            });
        } else {
            let updatedBank = null;

            // Handle bank balance update only for new FDs
            if (fd.updateType === 'new') {
                // 1. Check bank account and balance
                const bankAccount = await BankDetails.findById(fd.linkedBankAccount);
                if (!bankAccount) {
                    return res.status(404).json({ 
                        message: 'Linked bank account not found' 
                    });
                }

                // Calculate available balance considering minimum balance for OD accounts
                const availableBalance = bankAccount.accountType === 'OD' 
                    ? Math.abs(bankAccount.minimumBalance) + bankAccount.balance
                    : bankAccount.balance;

                // Check if sufficient balance is available
                if (availableBalance < fd.depositAmount) {
                    return res.status(400).json({ 
                        message: bankAccount.accountType === 'OD' 
                            ? `Insufficient balance. Available balance (including OD limit): ${availableBalance}` 
                            : 'Insufficient bank balance for FD creation'
                    });
                }

                // Check if debit would exceed minimum balance limit
                const balanceAfterDebit = bankAccount.balance - fd.depositAmount;
                if (balanceAfterDebit < bankAccount.minimumBalance) {
                    return res.status(400).json({ 
                        message: `Transaction would exceed minimum balance limit of ${bankAccount.minimumBalance}` 
                    });
                }

                // 2. Update bank balance
                updatedBank = await BankDetails.findByIdAndUpdate(
                    fd.linkedBankAccount,
                    {
                        $inc: { balance: -fd.depositAmount }
                    },
                    { new: true }
                );

                if (!updatedBank) {
                    return res.status(500).json({ 
                        message: 'Failed to update bank balance' 
                    });
                }
            }

            // 3. Update FD status
            const updatedFD = await FixedDeposit.findByIdAndUpdate(
                id,
                { verificationStatus: 'Approved' },
                { new: true }
            );

            if (!updatedFD) {
                // If FD update fails and bank was updated, revert bank balance
                if (updatedBank) {
                    await BankDetails.findByIdAndUpdate(
                        fd.linkedBankAccount,
                        {
                            $inc: { balance: fd.depositAmount }
                        }
                    );
                }
                return res.status(500).json({ 
                    message: 'Failed to update fixed deposit status' 
                });
            }

            // 4. Create ledger entry
            const ledgerEntry = new AccountsLedger({
                ledgerId: fd._id,
                ledgerName: `${fd.bankName} - ${fd.accountNumber}`,
                groupId: fd.accountingGroupId,
                openingBalance: fd.updateType === 'existing' ? fd.fdBalance : 0,
                balanceType: 'Dr',
                balanceAsOn: fd.updateType === 'existing' ? fd.balanceAsOn : fd.depositDate,
                status: 'Approved',
                levelId: fd.levelId
            });

            await ledgerEntry.save();

            // Only add signature and remarks after all operations are successful
            await addSignatureAndRemarks(
                id, 
                req.user.roleId, 
                levelId, 
                remarks, 
                req.user._id, 
                req.user.userName
            );

            // 5. Update notification status
            await NotificationHub.findOneAndUpdate(
                { relatedEntityId: id },
                { status: 'Approved' }
            );

            return res.status(200).json({
                message: fd.updateType === 'new' 
                    ? "Fixed deposit approved, ledger created, and bank balance updated successfully"
                    : "Existing fixed deposit recorded and ledger created successfully",
                fixedDeposit: updatedFD,
                ...(updatedBank && { 
                    bankBalance: updatedBank.balance,
                    availableBalance: updatedBank.accountType === 'OD' 
                        ? Math.abs(updatedBank.minimumBalance) + updatedBank.balance 
                        : updatedBank.balance
                }),
                ledger: ledgerEntry
            });
        }

    } catch (error) {
        console.error('Fixed deposit update error:', error);
        res.status(500).json({
            message: 'An error occurred while updating the fixed deposit',
            error: error.message
        });
    }
};
const rejectFixedDeposit = async (req, res) => {
    try {
        const { id, remarks } = req.body;

        const fd = await FixedDeposit.findOne({ 
            _id: id, 
            verificationStatus: 'Verification' 
        });

        if (!fd) {
            return res.status(404).json({ 
                message: 'No fixed deposit found for verification' 
            });
        }

        const { _id, levelId } = fd;

        fd.verificationStatus = 'Rejected';
        await fd.save();

        await NotificationHub.findOneAndUpdate(
            { relatedEntityId: _id },
            { status: 'Rejected' }
        );

        await addSignatureAndRemarks(
            _id, 
            req.user.roleId, 
            levelId, 
            remarks, 
            req.user._id, 
            req.user.userName
        );

        return res.status(200).json({ 
            message: 'Fixed deposit rejected successfully' 
        });
    } catch (error) {
        console.error('Error rejecting fixed deposit:', error);
        res.status(500).json({ 
            message: 'Server error', 
            error: error.message 
        });
    }
};const getAllFixedDeposits = async (req, res) => {
    try {
        const fixedDeposits = await FixedDeposit.find({
            verificationStatus: 'Approved'
        })
        .populate('linkedBankAccount', 'bankName accountNumber')
        .populate('accountingGroupId', 'groupName');

        const formattedFDs = fixedDeposits.map(fd => ({
            id: fd._id,
            fdType: fd.fdType,
            bankName: fd.bankName,
            accountNumber: fd.accountNumber,
            depositAmount: fd.depositAmount,
            maturityAmount: fd.maturityAmount,
            rateOfInterest: fd.rateOfInterest,
            depositDate: fd.depositDate,
            maturityDate: fd.maturityDate,
            status: fd.status,
            linkedBankAccount: fd.linkedBankAccount ? {
                bankName: fd.linkedBankAccount.bankName,
                accountNumber: fd.linkedBankAccount.accountNumber
            } : null,
            accountingGroup: fd.accountingGroupId ? fd.accountingGroupId.groupName : null,
            interestPayout: fd.interestPayout
        }));

        res.status(200).json({
            message: 'Fixed deposits retrieved successfully',
            fixedDeposits: formattedFDs
        });

    } catch (error) {
        console.error('Error fetching fixed deposits:', error);
        res.status(500).json({
            message: 'An error occurred while fetching fixed deposits',
            error: error.message
        });
    }
};




module.exports = {
    createFixedDeposit,
    updateFixedDeposit,
    checkFDAccountExists,
    getFDsForVerification,
    rejectFixedDeposit,
    getFDSummary,
    getAllFixedDeposits
};