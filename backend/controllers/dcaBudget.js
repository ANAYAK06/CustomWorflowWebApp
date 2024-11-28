const CCBudget = require('../models/ccBudgetModel')
const DCACode = require('../models/dcacodeModel')
const SubDCA = require('../models/subDCAModel')
const UserCostCentre = require('../models/userCostCentres')
const UserRoles = require('../models/userRolesModel')
const {addSignatureAndRemarks, getSignatureandRemakrs} = require('./signatureAndRemarks')
const notificationEmitter = require('../notificationEmitter')
const NotificationHub = require('../models/notificationHubModel')
const DCABudget = require('../models/dcaBudgetModel')
const SubDCABudget = require('../models/subdcaBudgetModel')
const Permission = require('../models/permissionModel')
const CostCentre = require('../models/costCentreModel');



const generateReferenceNumber = (ccNo) => {
    const date = new Date()
    const timestamp = date.getTime()
    const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    return `${ccNo}-${timestamp}-${randomSuffix}`
}


const getEligibleCCs = async(req, res)=> {
    try {
        const {ccid, subId} = req.query

        if(!ccid || !subId){
            return res.status(400).json({message: 'Cost Centre Type are required'})
        }
        const eligibleCC = await CCBudget.find({
            ccid:ccid,
            subId:subId,
            status: 'Approved',

            dcaBudgetAssigned:{$ne: true}


        }).select('ccNo ccBudget budgetBalance applyFiscalYear fiscalYear')
        res.status(200).json(eligibleCC)
    } catch (error) {
        console.error('Error fetching eligible CCs:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
        
    }
}

const getDCAForCC = async( req, res) => {
    try {
        const {ccid, subId, ccNo} = req.query

        if(!ccid || !subId || !ccNo) {
            return res.status(400).json({message:'Cost Centre Type, Sub Type, and CC Code required '})
        }

        const dcas = await DCACode.find({
            'applicableCostCentres.ccid':ccid,
            'applicableCostCentres.subId':subId
        })

        const dcaWithSubDCAs = await Promise.all(dcas.map(async (dca) => {
            const subDCAs = await SubDCA.find({dcaCode:dca.code})
            return{
                ...dca.toObject(),
                subDcas:subDCAs
            }
        }))
        res.status(200).json(dcaWithSubDCAs)
    } catch (error) {
        console.error('Error fetching DCAs for CC:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
        
    }
}

const assignDCABudget = async (req, res) => {
    try {
        const {ccNo, fiscalYear, dcaAllocations, remarks, ccid, subId} = req.body

        let query = {ccNo, status:'Approved'}
        if(fiscalYear) {
            query.applyFiscalYear = true
            query.fiscalYear = fiscalYear
        } else {
            query.applyFiscalYear = false
        }

        const ccBudget = await CCBudget.findOne(query)
        if(!ccBudget) {
            return res.status(400).json({message: 'CC Budget not found'})
        }

        const totalAllocation = dcaAllocations.reduce((sum, dca) => sum + dca.assignedAmount, 0)
        if(totalAllocation > ccBudget.budgetBalance) {
            return res.status(400).json({message: 'Total allocation exceeds available budget'})
        }

        // Generate a unique reference number for this batch
        const referenceNumber = generateReferenceNumber(ccNo)

        // Create all DCA Budgets with the reference number
        const dcaBudgetPromises = dcaAllocations.map(dca => 
            DCABudget.create({
                ccid,
                subId,
                ccNo,
                dcaCode: dca.dcaCode,
                assignedBudget: dca.assignedAmount,
                balanceBudget: dca.assignedAmount,
                fiscalYear,
                applyFiscalYear: !!fiscalYear,
                status: 'Verification',
                referenceNumber // Add reference number to each record
            })
        )

        const createdDCABudgets = await Promise.all(dcaBudgetPromises)

        // Update CC Budget
        ccBudget.budgetBalance -= totalAllocation
        ccBudget.dcaBudgetAssigned = true
        await ccBudget.save()

        // Get workflow permission
        const permission = await Permission.findOne({workflowId: 133})
        if(!permission) {
            return res.status(404).json({message: 'Workflow not found'})
        }

        const workflowDetail = permission.workflowDetails.find(detail =>
            detail.costCentreType === parseInt(ccid) && detail.levelId === 1
        )

        if(!workflowDetail) {
            return res.status(404).json({message: 'Workflow detail not found'})
        }

        // Create notification using reference number instead of single DCA budget ID
        const newNotification = new NotificationHub({
            workflowId: 133,
            roleId: workflowDetail.roleId,
            pathId: workflowDetail.pathId,
            levelId: 1,
            relatedEntityId: referenceNumber, // Use reference number instead of single DCA budget ID
            message: `New DCA Budget Assigned for CC: ${ccNo}${fiscalYear ? ` for FY ${fiscalYear}` : ''}`,
            status: 'Pending',
            isCostCentreBased: true,
            ccCode: ccNo
        })

        await newNotification.save()

        // Add signature for the entire transaction using reference number
        await addSignatureAndRemarks(
            referenceNumber, 
            req.user.roleId, 
            1, 
            remarks, 
            req.user._id, 
            req.user.userName
        )

        return res.status(201).json({
            message: 'DCA Budget Assigned Successfully',
            referenceNumber,
            dcaBudgets: createdDCABudgets,
            notification: newNotification
        })

    } catch (error) {
        console.error('Error assigning DCA Budget:', error)
        return res.status(500).json({ 
            message: 'An error occurred while assigning DCA Budget', 
            error: error.message 
        })
    }
}
const getFiscalYearsForCC = async (req, res) => {
    try {
        const { ccNo } = req.query;

        if (!ccNo) {
            return res.status(400).json({ message: 'CC Number is required' });
        }

        const fiscalYears = await CCBudget.distinct('fiscalYear', { 
            ccNo, 
            applyFiscalYear: true, 
            status: 'Approved' 
        });

        res.status(200).json(fiscalYears);
    } catch (error) {
        console.error('Error fetching fiscal years for CC:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const getBudgetForCCAndFiscalYear = async (req, res) => {
    try {
        const { ccNo, fiscalYear } = req.query;

        if (!ccNo || !fiscalYear) {
            return res.status(400).json({ message: 'CC Number and Fiscal Year are required' });
        }

        const budget = await CCBudget.findOne({ 
            ccNo, 
            fiscalYear, 
            status: 'Approved' 
        }).select('ccBudget budgetBalance');

        if (!budget) {
            return res.status(404).json({ message: 'Budget not found for the given CC and Fiscal Year' });
        }

        res.status(200).json(budget);
    } catch (error) {
        console.error('Error fetching budget for CC and Fiscal Year:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};


const getDCABudgetForVerification = async (req, res) => {
    const userRoleId = parseInt(req.query.userRoleId)

    try {
        const userRole = await UserRoles.findOne({roleId: userRoleId})
        if(!userRole) {
            return res.status(404).json({message: 'No User Role Found'})
        }

        const permission = await Permission.findOne({workflowId: 133})
        if(!permission) {
            return res.status(404).json({message: 'No Workflow found'})
        }

        const relevantWorkflowDetails = permission.workflowDetails.filter(
            detail => detail.roleId === userRoleId && 
            (!userRole.isCostCentreApplicable || userRole.costCentreTypes.includes(detail.costCentreType))
        )

        if(relevantWorkflowDetails.length === 0) {
            return res.status(404).json({message: 'No matching workflow details found'})
        }

        // Get notifications using reference numbers
        const notifications = await NotificationHub.find({
            workflowId: 133,
            roleId: userRoleId,
            pathId: {$in: relevantWorkflowDetails.map(detail => detail.pathId)},
            status: 'Pending'
        })

        if(!notifications.length) {
            return res.status(200).json({message: 'No pending Notification available', dcaBudgets: []})
        }

        // Get reference numbers from notifications
        const referenceNumbers = notifications.map(n => n.relatedEntityId)
        
        let dcaBudgetQuery = {
            referenceNumber: {$in: referenceNumbers},
            status: 'Verification',
            levelId: {$in: relevantWorkflowDetails.map(detail => detail.levelId)}
        }

        if(userRole.isCostCentreApplicable) {
            const userCostCentres = await UserCostCentre.findOne({
                userId: req.user._id, 
                roleId: userRoleId
            })
            
            if(!userCostCentres || !userCostCentres.costCentreId.length) {
                return res.status(200).json({
                    message: "No cost centre assigned to this user", 
                    dcaBudgets: []
                })
            }

            dcaBudgetQuery.ccid = {$in: userRole.costCentreTypes}
            dcaBudgetQuery.ccNo = {$in: userCostCentres.costCentreId}
        }

        const dcaBudgets = await DCABudget.find(dcaBudgetQuery)

        if(!dcaBudgets.length) {
            return res.status(200).json({
                message: 'No DCA Budget found for verification', 
                dcaBudgets: []
            })
        }

        // Group by reference number instead of ccNo
        const groupedDCABudgets = dcaBudgets.reduce((acc, budget) => {
            if(!acc[budget.referenceNumber]) {
                acc[budget.referenceNumber] = []
            }
            acc[budget.referenceNumber].push(budget)
            return acc
        }, {})

        const dcaBudgetWithSignatures = await Promise.all(
            Object.entries(groupedDCABudgets).map(async ([referenceNumber, budgets]) => {
                const ccNo = budgets[0].ccNo
                const ccid = budgets[0].ccid
                const signatureAndRemarks = await getSignatureandRemakrs(referenceNumber)
                const ccBudget = await CCBudget.findOne({ccNo, status: 'Approved'})
                const costCentre = await CostCentre.findOne({ccNo})
                
                const dcaCodes = budgets.map(budget => budget.dcaCode)
                const dcaNames = await DCACode.find({code: {$in: dcaCodes}}).select('code name')
                const dcaNameMap = dcaNames.reduce((acc, dca) => {
                    acc[dca.code] = dca.name
                    return acc
                }, {})

                return {
                    referenceNumber,
                    ccNo,
                    ccid,
                    ccName: costCentre ? costCentre.ccName : 'Unknown',
                    ccBudget: ccBudget ? ccBudget.ccBudget : 0,
                    budgetBalance: ccBudget ? ccBudget.budgetBalance : 0,
                    assignedBudget: budgets.reduce((sum, b) => sum + b.assignedBudget, 0),
                    budgets: budgets.map(budget => ({
                        dcaCode: budget.dcaCode,
                        dcaName: dcaNameMap[budget.dcaCode] || 'Unknown',
                        assignedBudget: budget.assignedBudget
                    })),
                    signatureAndRemarks
                }
            })
        )

        res.status(200).json({dcaBudgets: dcaBudgetWithSignatures})

    } catch (error) {
        console.error('Error fetching DCA Budgets for verification:', error)
        res.status(500).json({ message: 'Server error', error: error.message })
    }
}

const updateDCABudget = async (req, res) => {
    try {
        const { referenceNumber, remarks } = req.body

        // Find all DCA budgets for this reference number that are in verification
        const dcaBudgets = await DCABudget.find({ 
            referenceNumber, 
            status: 'Verification' 
        })

        if (dcaBudgets.length === 0) {
            return res.status(404).json({ 
                message: "No DCA Budget found for Verification" 
            })
        }

        const permission = await Permission.findOne({ workflowId: 133 })
        if (!permission) {
            return res.status(404).json({ message: 'Permission not found' })
        }

        const { workflowDetails } = permission
        const { levelId, ccid } = dcaBudgets[0]

        // Filter workflow details for the specific cost centre type
        const relevantWorkflowDetails = workflowDetails.filter(
            detail => detail.costCentreType === ccid
        )

        // Find the current and next role details
        const currentRoleDetail = relevantWorkflowDetails.find(
            detail => detail.levelId === levelId
        )
        const nextRoleDetail = relevantWorkflowDetails.find(
            detail => detail.levelId === levelId + 1
        )

        // Add single signature for the entire batch using reference number
        await addSignatureAndRemarks(
            referenceNumber,
            req.user.roleId,
            levelId,
            remarks,
            req.user._id,
            req.user.userName
        )

        if (nextRoleDetail) {
            // Update all DCA budgets in the batch
            await DCABudget.updateMany(
                { referenceNumber },
                { levelId: nextRoleDetail.levelId }
            )

            // Update notification
            await NotificationHub.findOneAndUpdate(
                { relatedEntityId: referenceNumber },
                {
                    levelId: nextRoleDetail.levelId,
                    roleId: nextRoleDetail.roleId,
                    pathId: nextRoleDetail.pathId,
                    status: 'Pending'
                }
            )

            notificationEmitter.emit('notification', {
                userRoleId: nextRoleDetail.roleId,
                count: 1
            })

            return res.status(200).json({ 
                message: "DCA Budgets updated to next level" 
            })
        } else {
            // Approve all DCA budgets in the batch
            await DCABudget.updateMany(
                { referenceNumber },
                { status: 'Approved' }
            )

            // Update notification
            await NotificationHub.findOneAndUpdate(
                { relatedEntityId: referenceNumber },
                { status: 'Approved' }
            )

            return res.status(200).json({ 
                message: "DCA Budgets approved successfully" 
            })
        }

    } catch (error) {
        console.error('Error updating DCA Budget:', error)
        res.status(500).json({ message: 'Server error', error: error.message })
    }
}

const rejectDCABudget = async (req, res) => {
    try {
        const { ccNo, remarks } = req.body;

        // Find all DCA budgets for this CC that are in verification
        const dcaBudgets = await DCABudget.find({ ccNo, status: 'Verification' });

        if (dcaBudgets.length === 0) {
            return res.status(404).json({ message: 'No DCA Budget found for verification' });
        }

        // Calculate total amount to be returned to CC budget
        const totalAmount = dcaBudgets.reduce((sum, budget) => sum + budget.assignedBudget, 0);

        // Find and update CC Budget
        let query = { ccNo, status: 'Approved' };
        if (dcaBudgets[0].applyFiscalYear) {
            query.fiscalYear = dcaBudgets[0].fiscalYear;
            query.applyFiscalYear = true;
        } else {
            query.applyFiscalYear = false;
        }

        const ccBudget = await CCBudget.findOne(query);
        if (!ccBudget) {
            return res.status(404).json({ message: 'CC Budget not found' });
        }

        // Update CC Budget balance and status
        ccBudget.budgetBalance += totalAmount;
        ccBudget.dcaBudgetAssigned = false; // Reset the flag since budget is being rejected
        await ccBudget.save();

        // Update status of all DCA budgets and add signatures
        for (const dcaBudget of dcaBudgets) {
            const { _id, levelId } = dcaBudget;

            // Update DCA Budget status
            dcaBudget.status = 'Rejected';
            await dcaBudget.save();

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
        }

        return res.status(200).json({ 
            message: 'DCA Budget rejected successfully',
            returnedAmount: totalAmount,
            updatedBalance: ccBudget.budgetBalance
        });

    } catch (error) {
        console.error('Error rejecting DCA Budget:', error);
        return res.status(500).json({ 
            message: 'Server error', 
            error: error.message 
        });
    }
};


module.exports = {
    getEligibleCCs,
    getDCAForCC,
    assignDCABudget,
    getFiscalYearsForCC,
    getBudgetForCCAndFiscalYear,
    getDCABudgetForVerification,
    updateDCABudget,
    rejectDCABudget
}