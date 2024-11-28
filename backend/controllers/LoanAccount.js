const mongoose = require('mongoose');
const Loan = require('../models/loanAccountModel');
const Permission = require('../models/permissionModel');
const notificationEmitter = require('../notificationEmitter');
const NotificationHub = require('../models/notificationHubModel');
const User = require('../models/usersModel');
const UserRoles = require('../models/userRolesModel');
const { addSignatureAndRemarks, getSignatureandRemakrs } = require('./signatureAndRemarks');
const AccountsLedger = require('../models/accountsLedgerModel');
const BankDetails = require('../models/bankAccountModel');

const checkLoanNumberExists = async (req, res) => {
    try {
        const { loanNumber } = req.query;
        if (!loanNumber) {
            return res.status(400).json({ message: "Loan number required" });
        }

        const existingLoan = await Loan.findOne({ 
            loanNumber: { $regex: new RegExp(`^${loanNumber}$`, 'i') }
        });

        if (existingLoan) {
            return res.json({ 
                exists: true, 
                message: 'Loan number already exists' 
            });
        } else {
            return res.json({ 
                exists: false, 
                message: 'Loan number is available' 
            });
        }
    } catch (error) {
        console.error('Error checking loan number:', error);
        res.status(500).json({ 
            message: 'An error occurred while checking the loan number', 
            error: error.message 
        });
    }
};

const createLoan = async (req, res) => {
    try {
        const {
            updateType,  // New field to distinguish between new and existing loans
            loanType,
            lenderName,
            lenderType,
            loanPurpose,
            loanNumber,
            disbursementDate,
            loanAmount,
            charges,
            rateOfInterest,
            numberOfInstallments,
            emiStartDate,
            linkedBankAccount,
            amountReceiptType,
            accountingGroupId,
            openingBalanceAsOn,  // This will be different for new vs existing loans
            currentBalance,      // New field for existing loans
            securityDetails,
            remarks
        } = req.body;

        console.log('Received accountingGroupId:', accountingGroupId);


        // Validate required fields
        if (!disbursementDate || !openingBalanceAsOn || !accountingGroupId || !updateType) {
            return res.status(400).json({
                message: "Disbursement date, opening balance date, accounting group, and update type are required"
            });
        }

        // For existing loans, currentBalance is required
        if (updateType === 'existing' && currentBalance === undefined) {
            return res.status(400).json({
                message: "Current balance is required for existing loans"
            });
        }

        // Check if loan number already exists
        const existingLoan = await Loan.findOne({
            loanNumber: { $regex: new RegExp(`^${loanNumber}$`, 'i') }
        });

        if (existingLoan) {
            return res.status(400).json({ message: "Loan number already exists" });
        }

        // Validate accounting group exists
        const accountGroup = await mongoose.model('accountgroup').findById(accountingGroupId);
        if (!accountGroup) {
            return res.status(400).json({ message: "Invalid accounting group" });
        }

        // Validate linked bank account exists
        const bankAccount = await BankDetails.findById(linkedBankAccount);
        if (!bankAccount) {
            return res.status(400).json({ message: "Invalid linked bank account" });
        }

        // Calculate disbursed amount for new loans
        const totalCharges = Object.values(charges).reduce((sum, charge) => sum + (charge || 0), 0);
        const disbursedAmount = updateType === 'new' ? loanAmount - totalCharges : loanAmount;

        // Set the opening balance and loan balance based on loan type
        const openingBalance = updateType === 'new' ? loanAmount : currentBalance;
        const loanBalance = updateType === 'new' ? loanAmount : currentBalance;

        // Create new loan
        const newLoan = new Loan({
            updateType,
            loanType,
            lenderName,
            lenderType,
            loanPurpose,
            loanNumber,
            disbursementDate: new Date(disbursementDate),
            loanAmount,
            charges: updateType === 'new' ? charges : {}, // Only apply charges for new loans
            disbursedAmount,
            rateOfInterest,
            numberOfInstallments,
            emiStartDate: new Date(emiStartDate),
            linkedBankAccount:linkedBankAccount,
            amountReceiptType,
            accountingGroupId: accountingGroupId,
            openingBalance,
            openingBalanceAsOn: new Date(openingBalanceAsOn),
            loanBalance,
            securityDetails: loanType === 'secured' ? securityDetails : undefined,
            status: 'Verification',
            levelId: 1,
            loanStatus: 'active'
        });

        await newLoan.save();

        // Add signature and remarks
        await addSignatureAndRemarks(
            newLoan._id,
            req.user.roleId,
            1,
            remarks,
            req.user._id,
            req.user.userName
        );

        // Get workflow permission
        const permission = await Permission.findOne({ workflowId: 140 });
        if (!permission) {
            return res.status(404).json({ message: "Workflow not found" });
        }

        const workflowDetail = permission.workflowDetails.find(detail => detail.levelId === 1);
        if (!workflowDetail) {
            return res.status(404).json({ message: 'Workflow detail not found' });
        }

        // Create notification with different messages for new vs existing loans
        const notificationMessage = updateType === 'new' 
            ? `New Loan Created: ${lenderName} - ${loanNumber}`
            : `Existing Loan Updated: ${lenderName} - ${loanNumber}`;

        const newNotification = new NotificationHub({
            workflowId: 140,
            roleId: workflowDetail.roleId,
            pathId: workflowDetail.pathId,
            levelId: 1,
            relatedEntityId: newLoan._id,
            message: notificationMessage,
            status: 'Pending'
        });
        await newNotification.save();

        // Emit notification
        notificationEmitter.emit('notification', {
            userRoleId: workflowDetail.roleId,
            count: 1
        });

        res.status(201).json({
            message: updateType === 'new' 
                ? 'New loan created successfully and sent for verification'
                : 'Existing loan recorded successfully and sent for verification',
            loan: newLoan,
            notification: newNotification
        });

    } catch (error) {
        console.error('Loan Creation Error:', error);
        res.status(500).json({
            message: 'An error occurred while creating the loan',
            error: error.message
        });
    }
};

const getLoansForVerification = async (req, res) => {
    const userRoleId = parseInt(req.query.userRoleId);
    try {
        if (isNaN(userRoleId)) {
            return res.status(400).json({ message: 'Invalid userRoleId provided' });
        }

        const userRole = await UserRoles.findOne({ roleId: userRoleId });
        if (!userRole) {
            return res.status(404).json({ message: 'User role not found' });
        }

        const permission = await Permission.findOne({ workflowId: 140 });
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
                loans: []
            });
        }

        const notifications = await NotificationHub.find({
            workflowId: 140,
            roleId: userRoleId,
            pathId: { $in: relevantWorkflowDetails.map(detail => detail.pathId) },
            status: 'Pending'
        });

        if (!notifications.length) {
            return res.status(200).json({
                message: 'No pending items for verification',
                reason: 'No pending notifications available',
                loans: []
            });
        }

        const loanIds = notifications.map(notification => notification.relatedEntityId);

        let loanQuery = {
            _id: { $in: loanIds },
            status: 'Verification',
            levelId: { $in: relevantWorkflowDetails.map(detail => detail.levelId) }
        };

        const loans = await Loan.find(loanQuery).populate('linkedBankAccount', 'bankName accountNumber');

        if (!loans.length) {
            return res.status(200).json({
                message: 'No items to verify',
                reason: 'No loans found for verification',
                loans: []
            });
        }

        const loansWithSignatures = await Promise.all(loans.map(async (loan) => {
            const signatureAndRemarks = await getSignatureandRemakrs(loan._id);
            return {
                ...loan.toObject(),
                signatureAndRemarks
            };
        }));

        res.status(200).json({
            message: 'Loans retrieved successfully',
            loans: loansWithSignatures
        });

    } catch (error) {
        console.error('Error fetching loans for verification:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
const updateLoan = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        console.log('Update Loan Request:', {
            id,
            remarks,
            body: req.body
        });

        if (!remarks || remarks.trim() === '') {
            return res.status(400).json({
                message: "Remarks are required for verification"
            });
        }

        const loan = await Loan.findById(id);
        if (!loan) {
            return res.status(404).json({ message: "No loan found for verification" });
        }

        // Fetch the accounting group
        const accountGroup = await mongoose.model('accountgroup').findById(loan.accountingGroupId);
        if (!accountGroup) {
            return res.status(404).json({ message: "Accounting group not found" });
        }

        const { levelId } = loan;
        const permission = await Permission.findOne({ workflowId: 140 });
        
        if (!permission) {
            return res.status(403).json({ message: 'Permission not found' });
        }

        const { workflowDetails } = permission;
        const nextRoleDetail = workflowDetails.find(detail => detail.levelId === levelId + 1);

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
            const updatedLoan = await Loan.findByIdAndUpdate(
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
                message: "Loan updated to next level",
                loan: updatedLoan
            });
        } else {
            // Final approval - create/update ledger entry
            const updatedLoan = await Loan.findByIdAndUpdate(
                id,
                { status: 'Approved' },
                { new: true }
            );

            // Create ledger entry with proper accounting group reference
            const ledgerEntry = new AccountsLedger({
                ledgerId: loan._id,
                ledgerName: `${loan.lenderName} - ${loan.loanNumber}`,
                groupId: accountGroup._id,  // Fixed: Using accountGroup._id instead of loan.accountingGroupId
                openingBalance: loan.updateType ==='existing' ? loan.openingBalance:0,
                balanceType: 'Cr',
                balanceAsOn: loan.openingBalanceAsOn,
                status: 'Approved',
                levelId: loan.levelId
            });

            await ledgerEntry.save();

            await NotificationHub.findOneAndUpdate(
                { relatedEntityId: id },
                { status: 'Approved' }
            );

            return res.status(200).json({
                message: loan.updateType === 'new' 
                    ? "Loan approved and ledger created successfully"
                    : "Existing loan recorded and ledger updated successfully",
                loan: updatedLoan,
                ledger: ledgerEntry
            });
        }

    } catch (error) {
        console.error('Loan update error:', error);
        res.status(500).json({
            message: 'An error occurred while updating the loan',
            error: error.message
        });
    }
};

const rejectLoan = async (req, res) => {
    try {
        const { id, remarks } = req.body;

        const loan = await Loan.findOne({ 
            _id: id, 
            status: 'Verification' 
        });

        if (!loan) {
            return res.status(404).json({ 
                message: 'No loan found for verification' 
            });
        }

        const { _id, levelId } = loan;

        loan.status = 'Rejected';
        await loan.save();

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
            message: 'Loan rejected successfully' 
        });
    } catch (error) {
        console.error('Error rejecting loan:', error);
        res.status(500).json({ 
            message: 'Server error', 
            error: error.message 
        });
    }
};

const getLoanSchedule = async (req, res) => {
    try {
        const { id } = req.params;

        const loan = await Loan.findById(id);
        if (!loan) {
            return res.status(404).json({
                message: 'Loan not found'
            });
        }

        // Calculate EMI
        const P = loan.loanAmount;
        const r = loan.rateOfInterest / (12 * 100); // Monthly interest rate
        const n = loan.numberOfInstallments;
        const emi = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

        // Generate schedule
        let schedule = [];
        let remainingPrincipal = loan.loanAmount;
        let emiStartDate = new Date(loan.emiStartDate);

        for (let i = 1; i <= loan.numberOfInstallments; i++) {
            const interestPayment = remainingPrincipal * r;
            const principalPayment = emi - interestPayment;
            remainingPrincipal = remainingPrincipal - principalPayment;

            schedule.push({
                installmentNumber: i,
                dueDate: new Date(emiStartDate.setMonth(emiStartDate.getMonth() + 1)),
                emiAmount: Math.round(emi),
                principalComponent: Math.round(principalPayment),
                interestComponent: Math.round(interestPayment),
                remainingPrincipal: Math.max(0, Math.round(remainingPrincipal)),
                status: 'Pending'
            });
        }

        res.status(200).json({
            message: 'Loan schedule retrieved successfully',
            loanSchedule: {
                loanDetails: {
                    loanNumber: loan.loanNumber,
                    loanAmount: loan.loanAmount,
                    interestRate: loan.rateOfInterest,
                    tenure: loan.numberOfInstallments,
                    emiAmount: Math.round(emi)
                },
                installments: schedule
            }
        });

    } catch (error) {
        console.error('Error generating loan schedule:', error);
        res.status(500).json({
            message: 'An error occurred while generating loan schedule',
            error: error.message
        });
    }
};

const getLoanSummary = async (req, res) => {
    try {
        const { id } = req.params;

        const loan = await Loan.findById(id)
            .populate('linkedBankAccount', 'bankName accountNumber')
            .populate('accountingGroupId', 'groupName');

        if (!loan) {
            return res.status(404).json({
                message: 'Loan not found'
            });
        }

        // Calculate EMI
        const monthlyInterest = loan.rateOfInterest / (12 * 100);
        const emi = (loan.loanAmount * monthlyInterest * Math.pow(1 + monthlyInterest, loan.numberOfInstallments)) 
                   / (Math.pow(1 + monthlyInterest, loan.numberOfInstallments) - 1);

        // Calculate total interest payable
        const totalPayable = emi * loan.numberOfInstallments;
        const totalInterest = totalPayable - loan.loanAmount;

        // Get total charges
        const totalCharges = Object.values(loan.charges).reduce((sum, charge) => sum + (charge || 0), 0);

        const summary = {
            loanDetails: {
                loanNumber: loan.loanNumber,
                loanType: loan.loanType,
                lenderName: loan.lenderName,
                lenderType: loan.lenderType,
                purpose: loan.loanPurpose,
                status: loan.loanStatus
            },
            financialDetails: {
                sanctionedAmount: loan.loanAmount,
                disbursedAmount: loan.disbursedAmount,
                totalCharges: totalCharges,
                rateOfInterest: loan.rateOfInterest,
                tenure: loan.numberOfInstallments,
                emiAmount: Math.round(emi),
                totalInterestPayable: Math.round(totalInterest),
                totalAmountPayable: Math.round(totalPayable)
            },
            accountDetails: {
                linkedBankAccount: loan.linkedBankAccount ? {
                    bankName: loan.linkedBankAccount.bankName,
                    accountNumber: loan.linkedBankAccount.accountNumber
                } : null,
                accountingGroup: loan.accountingGroupId ? loan.accountingGroupId.groupName : null
            },
            dateDetails: {
                disbursementDate: loan.disbursementDate,
                emiStartDate: loan.emiStartDate
            },
            securityDetails: loan.loanType === 'secured' ? loan.securityDetails : null,
            approvalDetails: {
                status: loan.status,
                levelId: loan.levelId
            }
        };

        res.status(200).json({
            message: 'Loan summary retrieved successfully',
            summary
        });

    } catch (error) {
        console.error('Error retrieving loan summary:', error);
        res.status(500).json({
            message: 'An error occurred while retrieving loan summary',
            error: error.message
        });
    }
};

module.exports = {
    createLoan,
    updateLoan,
    checkLoanNumberExists,
    getLoansForVerification,
    rejectLoan,
    getLoanSchedule,
    getLoanSummary
};