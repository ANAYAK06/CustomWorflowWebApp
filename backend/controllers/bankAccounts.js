const mongoose = require('mongoose');
const BankDetails = require('../models/bankAccountModel');
const Permission = require('../models/permissionModel');
const notificationEmitter = require('../notificationEmitter');
const NotificationHub = require('../models/notificationHubModel');
const User = require('../models/usersModel');
const UserRoles = require('../models/userRolesModel');
const { addSignatureAndRemarks, getSignatureandRemakrs } = require('./signatureAndRemarks');
const AccountsLedger = require('../models/accountsLedgerModel')

const checkBankAccountExists = async (req, res) => {
    try {
        const { accountNumber } = req.query;
        if (!accountNumber) {
            return res.status(400).json({ message: "Account number required" });
        }

        const existingAccount = await BankDetails.findOne({ 
            accountNumber: { $regex: new RegExp(`^${accountNumber}$`, 'i') }
        });

        if (existingAccount) {
            return res.json({ 
                exists: true, 
                message: 'Bank account number already exists' 
            });
        } else {
            return res.json({ 
                exists: false, 
                message: 'Bank account number is available' 
            });
        }
    } catch (error) {
        console.error('Error checking bank account:', error);
        res.status(500).json({ 
            message: 'An error occurred while checking the bank account', 
            error: error.message 
        });
    }
};
const createBankAccount = async (req, res) => {
    try {
        const {
            accountType,
            bankName,
            branch,
            accountNumber,
            accountOpeningDate,
            balanceAsOn,
            accountingGroupId,
            ifscCode,
            micrCode,
            branchAddress,
            contactNumber,
            enabledForOnlineTransaction,
            creditCard,
            openingBalance,
            minimumBalance,
            remarks
        } = req.body;

        // Validate required fields
        if (!accountOpeningDate || !balanceAsOn || !accountingGroupId) {
            return res.status(400).json({
                message: "Account opening date, balance as on date, and accounting group are required"
            });
        }

        // Check if account number already exists
        const existingAccount = await BankDetails.findOne({
            accountNumber: { $regex: new RegExp(`^${accountNumber}$`, 'i') }
        });

        if (existingAccount) {
            return res.status(400).json({ message: "Bank account number already exists" });
        }

        // Validate accounting group exists
        const accountGroup = await mongoose.model('accountgroup').findById(accountingGroupId);
        if (!accountGroup) {
            return res.status(400).json({ message: "Invalid accounting group" });
        }

        // Create new bank account
        const newBankAccount = new BankDetails({
            accountType,
            bankName,
            branch,
            accountNumber,
            accountOpeningDate: new Date(accountOpeningDate),
            balanceAsOn: new Date(balanceAsOn),
            accountingGroupId,
            ifscCode,
            micrCode,
            branchAddress,
            contactNumber,
            enabledForOnlineTransaction,
            creditCard,
            openingBalance,
            minimumBalance,
            balance: openingBalance, // Set initial balance to opening balance
            status: 'Verification',
            levelId: 1
        });

        await newBankAccount.save();

        // Add signature and remarks
        await addSignatureAndRemarks(
            newBankAccount._id,
            req.user.roleId,
            0,
            remarks,
            req.user._id,
            req.user.userName
        );

        // Get workflow permission
        const permission = await Permission.findOne({ workflowId: 139 });
        if (!permission) {
            return res.status(404).json({ message: "Workflow not found" });
        }

        const workflowDetail = permission.workflowDetails.find(detail => detail.levelId === 1);
        if (!workflowDetail) {
            return res.status(404).json({ message: 'Workflow detail not found' });
        }

        // Create notification
        const newNotification = new NotificationHub({
            workflowId: 139,
            roleId: workflowDetail.roleId,
            pathId: workflowDetail.pathId,
            levelId: 1,
            relatedEntityId: newBankAccount._id,
            message: `New Bank Account Created: ${bankName} - ${accountNumber}`,
            status: 'Pending'
        });
        await newNotification.save();

        // Emit notification
        notificationEmitter.emit('notification', {
            userRoleId: workflowDetail.roleId,
            count: 1
        });

        res.status(201).json({
            message: 'Bank account created successfully and sent for verification',
            bankAccount: newBankAccount,
            notification: newNotification
        });

    } catch (error) {
        console.error('Bank Account Creation Error:', error);
        res.status(500).json({
            message: 'An error occurred while creating the bank account',
            error: error.message
        });
    }
};

const getBankAccountsForVerification = async (req, res) => {
    const userRoleId = parseInt(req.query.userRoleId);
    try {
        if (isNaN(userRoleId)) {
            return res.status(400).json({ message: 'Invalid userRoleId provided' });
        }

        const userRole = await UserRoles.findOne({ roleId: userRoleId });
        if (!userRole) {
            return res.status(404).json({ message: 'User role not found' });
        }

        const permission = await Permission.findOne({ workflowId: 139 });
        if (!permission) {
            return res.status(404).json({ message: 'Workflow not found' });
        }

        const relevantWorkflowDetails = permission.workflowDetails.filter(
            detail => detail.roleId === userRoleId
        );

        if (relevantWorkflowDetails.length === 0) {
            return res.status(403).json({
                message: 'Access denied',
                reason: 'No matching workflow details found for this role',
                bankAccounts: []
            });
        }

        const notifications = await NotificationHub.find({
            workflowId: 139,
            roleId: userRoleId,
            pathId: { $in: relevantWorkflowDetails.map(detail => detail.pathId) },
            status: 'Pending'
        });

        if (!notifications.length) {
            return res.status(200).json({
                message: 'No pending items for verification',
                reason: 'No pending notifications available',
                bankAccounts: []
            });
        }

        const accountIds = notifications.map(notification => notification.relatedEntityId);

        let accountQuery = {
            _id: { $in: accountIds },
            status: 'Verification',
            levelId: { $in: relevantWorkflowDetails.map(detail => detail.levelId) }
        };

        const bankAccounts = await BankDetails.find(accountQuery);

        if (!bankAccounts.length) {
            return res.status(200).json({
                message: 'No items to verify',
                reason: 'No bank accounts found for verification',
                bankAccounts: []
            });
        }

        const accountsWithSignatures = await Promise.all(bankAccounts.map(async (account) => {
            const signatureAndRemarks = await getSignatureandRemakrs(account._id);
            return {
                ...account.toObject(),
                signatureAndRemarks
            };
        }));

        res.status(200).json({
            message: 'Bank accounts retrieved successfully',
            bankAccounts: accountsWithSignatures
        });

    } catch (error) {
        console.error('Error fetching bank accounts for verification:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateBankAccount = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        console.log('Updating bank account:', {
            id,
            remarks,
            body: req.body
        });

        if (!remarks) {
            return res.status(400).json({
                message: "Remarks are required for verification"
            });
        }

        const bankAccount = await BankDetails.findById(id);

        if (!bankAccount) {
            return res.status(404).json({ 
                message: "No bank account found for verification" 
            });
        }

        const { levelId } = bankAccount;
        const permission = await Permission.findOne({ workflowId: 139 });
        
        if (!permission) {
            return res.status(403).json({ message: 'Permission not found' });
        }

        const { workflowDetails } = permission;
        const nextRoleDetail = workflowDetails.find(detail => detail.levelId === levelId + 1);

        // Add signature and remarks
        await addSignatureAndRemarks(
            id, 
            req.user.roleId, 
            levelId, 
            remarks, 
            req.user._id, 
            req.user.userName
        );

        if (nextRoleDetail) {
            // Not final approval, update to next level
            const updatedBankAccount = await BankDetails.findByIdAndUpdate(
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
                message: "Bank account updated to next level",
                bankAccount: updatedBankAccount
            });
        } else {
            // Verify that the accounting group exists before creating ledger
            const accountGroup = await mongoose.model('accountgroup').findById(bankAccount.accountingGroupId);
            if (!accountGroup) {
                return res.status(400).json({
                    message: "Invalid accounting group ID for ledger creation"
                });
            }

            // Final approval
            const updatedBankAccount = await BankDetails.findByIdAndUpdate(
                id,
                { status: 'Approved' },
                { new: true }
            );

            // Create corresponding ledger entry with verified group ID
            const ledgerEntry = new AccountsLedger({
                ledgerId: bankAccount._id,
                ledgerName: `${bankAccount.bankName} - ${bankAccount.accountNumber}`,
                groupId: accountGroup._id, // Verified group ID
                openingBalance: bankAccount.openingBalance,
                balanceType: bankAccount.accountType === 'OD' ? 'Cr' : 'Dr',
                balanceAsOn: bankAccount.balanceAsOn,
                status: 'Approved',
                levelId: bankAccount.levelId
            });

            // Log ledger creation details for debugging
            console.log('Creating ledger entry:', {
                bankAccountId: bankAccount._id,
                accountingGroupId: bankAccount._id,
                ledgerGroupId: accountGroup._id,
                bankAccountType: bankAccount.accountType,
                balanceType: bankAccount.accountType === 'OD' ? 'Cr' : 'Dr'
            });

            await ledgerEntry.save();

            await NotificationHub.findOneAndUpdate(
                { relatedEntityId: id },
                { status: 'Approved' }
            );

            return res.status(200).json({
                message: "Bank account approved and ledger created successfully",
                bankAccount: updatedBankAccount,
                ledger: ledgerEntry
            });
        }

    } catch (error) {
        console.error('Bank account update error:', {
            error: error.message,
            stack: error.stack,
            details: error
        });
        
        res.status(500).json({
            message: 'An error occurred while updating the bank account',
            error: error.message
        });
    }
};

const rejectBankAccount = async (req, res) => {
    try {
        const { id, remarks } = req.body;

        const bankAccount = await BankDetails.findOne({ 
            _id: id, 
            status: 'Verification' 
        });

        if (!bankAccount) {
            return res.status(404).json({ 
                message: 'No bank account found for verification' 
            });
        }

        const { _id, levelId } = bankAccount;

        bankAccount.status = 'Rejected';
        await bankAccount.save();

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
            message: 'Bank account rejected successfully' 
        });
    } catch (error) {
        console.error('Error rejecting bank account:', error);
        res.status(500).json({ 
            message: 'Server error', 
            error: error.message 
        });
    }
};

const getAllBankAccounts = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            search = '', 
            accountType,
            bankName,
            status = 'Approved' // Default to fetch only approved accounts
        } = req.query;

        // Build query object
        let query = { status };

        // Add filters if provided
        if (accountType) {
            query.accountType = accountType;
        }
        
        if (bankName) {
            query.bankName = { $regex: new RegExp(bankName, 'i') };
        }

        // Add search functionality
        if (search) {
            query.$or = [
                { bankName: { $regex: new RegExp(search, 'i') } },
                { accountNumber: { $regex: new RegExp(search, 'i') } },
                { branch: { $regex: new RegExp(search, 'i') } },
                { ifscCode: { $regex: new RegExp(search, 'i') } }
            ];
        }

        // Calculate skip value for pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Get total count for pagination
        const totalCount = await BankDetails.countDocuments(query);

        // Fetch bank accounts with pagination and populate accounting group
        const bankAccounts = await BankDetails.find(query)
            .populate('accountingGroupId', 'groupName natureId')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        // Calculate total pages
        const totalPages = Math.ceil(totalCount / parseInt(limit));

        // Prepare pagination info
        const pagination = {
            currentPage: parseInt(page),
            totalPages,
            totalItems: totalCount,
            hasNextPage: parseInt(page) < totalPages,
            hasPrevPage: parseInt(page) > 1
        };

        // Transform data to include formatted dates and currency
        const formattedAccounts = bankAccounts.map(account => ({
            _id: account._id,
            accountNumber: account.accountNumber,
            bankName: account.bankName,
            branch: account.branch,
            accountType: account.accountType,
            ifscCode: account.ifscCode,
            balance: account.balance,
            accountOpeningDate: account.accountOpeningDate,
            balanceAsOn: account.balanceAsOn,
            accountingGroup: account.accountingGroupId ? {
                _id: account.accountingGroupId._id,
                groupName: account.accountingGroupId.groupName,
                natureId: account.accountingGroupId.natureId
            } : null,
            status: account.status,
            enabledForOnlineTransaction: account.enabledForOnlineTransaction,
            minimumBalance: account.minimumBalance,
            openingBalance: account.openingBalance,
            branchAddress: account.branchAddress,
            contactNumber: account.contactNumber,
            creditCard: account.creditCard
        }));

        res.status(200).json({
            message: 'Bank accounts retrieved successfully',
            bankAccounts: formattedAccounts,
            pagination,
            filters: {
                accountType,
                bankName,
                search
            }
        });

    } catch (error) {
        console.error('Error fetching bank accounts:', error);
        res.status(500).json({
            message: 'An error occurred while fetching bank accounts',
            error: error.message
        });
    }
};

module.exports = {
    createBankAccount,
    updateBankAccount,
    checkBankAccountExists,
    getBankAccountsForVerification,
    rejectBankAccount,
    getAllBankAccounts
};