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
        if(fiscalYear){
            query.applyFiscalYear = true;
            query.fiscalYear = fiscalYear
        } else {
            query.applyFiscalYear = false
        }

        const ccBudget = await CCBudget.findOne(query)
        if(!ccBudget){
            return res.status(400).json({message: 'CC Budget not found'})
        }

        const totalAllocation = dcaAllocations.reduce((sum, dca) => sum + dca.assignedAmount, 0)
        if(totalAllocation > ccBudget.budgetBalance){
            return res.status(400).json({message: 'Total allocation exceeds available budget'})
        }
        const dcaBudgetPromises = dcaAllocations.map(dca => 
            DCABudget.create({
                ccid,
                subId,
                ccNo,
                dcaCode:dca.dcaCode,
                assignedBudget:dca.assignedAmount,
                balanceBudget:dca.assignedAmount,
                fiscalYear,
                applyFiscalYear: !!fiscalYear,
                status:'Verification',
                
            })
        )
        const createdDCABudgets = await Promise.all(dcaBudgetPromises)

        const subDCABudgetPromises = dcaAllocations.flatMap(dca => 
            dca.subDcas.map(subDca =>
                SubDCABudget.create({
                    ccNo,
                    dcaCode:dca.dcaCode,
                    subDcaCode:subDca.subDcaCode,
                    assignedBudget:subDca.amount,
                    balanceBudget:subDca.amount,
                    fiscalYear,
                    applyFiscalYear: !!fiscalYear,
                    status:'Verification',
                    
                })
            )
        )

        await Promise.all(subDCABudgetPromises)

        ccBudget.budgetBalance -= totalAllocation
        await ccBudget.save()


        // create Notification 

        const permission = await Permission.findOne({workflowId:133})
        if(!permission) {
            return res.status(404).json({message: 'Workflow not found'})
        }

        const workflowDetail = permission.workflowDetails.find(detail =>
            detail.costCentreType === parseInt(ccid) &&  detail.levelId === 1
        )

        if(!workflowDetail){
            return res.status(404).json({message:'Workflow detail not found'})
        }

        const newNotification = new NotificationHub({
            workflowId:133,
            roleId: workflowDetail.roleId,
            pathId:workflowDetail.pathId,
            levelId:1,
            relatedEntityId:createdDCABudgets[0]._id,
            message: `New DCA Budget Assigned for CC: ${ccNo}${fiscalYear ? `for FY ${fiscalYear}`:''}`,
            status:'Pending',
            isCostCentreBased:true,
            ccCode:ccNo
        })

        await newNotification.save()


        await addSignatureAndRemarks(createdDCABudgets[0]._id, req.user.roleId, 1, remarks, req.user._id, req.user.userName)

        res.status(201).json({
            message:'DCA Budget Assigned Successfully',
            dcaBudgets:createdDCABudgets,
            notification:newNotification
        })

    } catch (error) {
        console.error('Error assigning DCA Budget:', error);
        res.status(500).json({ message: 'An error occurred while assigning DCA Budget', error: error.message });
        
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



const getDCABudgetForVerification = async ( req, res) => {
    const userRoleId = parseInt(req.query.userRoleId)

    try {
        const userRole = await UserRoles.findOne({roleId:userRoleId})
        if(!userRole){
            return res.status(404).json({message:' No User Role Found'})
        }
        const permission = await Permission.findOne({workflowId:133})
        if(!permission){
            return res.status(404).json({message:' No Workflow found'})
        }
        const relventworkflowDetails = permission.workflowDetails.filter(
            detail => detail.roleId === userRoleId && 
            (!userRole.isCostCentreApplicable || userRole.costCentreTypes.includes(detail.costCentreType))
        )
        if(relventworkflowDetails.length === 0){
            return res.status(404).json({message: 'No matching workflow details found'})
        }
        const notifications = await NotificationHub.find({
            workflowId:133,
            roleId:userRoleId,
            pathId:{$in: relventworkflowDetails.map(detail =>detail.pathId)},
            status:'Pending'
        })
        if(!notifications.length) {
            return res.status(200).json({message: 'No pending Notification available', dcaBudgets:[]})
        }

        const ccNos = [...new Set(notifications.map(notification => notification.ccCode))]

        const dcaBudgetIds = notifications.map(notification =>notification.relatedEntityId)
        let dcaBudgetQuery = {
            ccNo:{$in: ccNos},
            status:'Verification',
            levelId:{$in: relventworkflowDetails.map(detail => detail.levelId)}
        }
        if(userRole.isCostCentreApplicable){
            const userCostCentres = await UserCostCentre.findOne({userId: req.user._id, roleId:userRoleId})
            if(!userCostCentres || !userCostCentres.costCentreId.length){
                return res.status(200).json({message:"No cost centre assigned to this user", dcaBudgets:[]})
            }

            dcaBudgetQuery.ccid = {$in: userRole.costCentreTypes}
            dcaBudgetQuery.ccNo = {$in: userCostCentres.costCentreId}
        }

        const dcaBudgets = await DCABudget.find(dcaBudgetQuery)

        if(!dcaBudgets.length){
            return res.status(200).json({message:'No DCA Budget found for verification', dcaBudgets:[]})
        }

        const groupedDCABudgets = dcaBudgets.reduce((acc, budget) => {
            if(!acc[budget.ccNo]){
                acc[budget.ccNo] = []

            }
            acc[budget.ccNo].push(budget)
            return acc
        }, {})
        

        const dcaBudgetWithSignatures = await Promise.all(
            Object.entries(groupedDCABudgets).map(async ([ccNo, budgets]) => {
                const signatureAndRemarks = await getSignatureandRemakrs(budgets[0]._id);
                const ccBudget = await CCBudget.findOne({ccNo, status:'Approved'})
                const costCentre = await CostCentre.findOne({ccNo})
                const dcaCodes = budgets.map(budget => budget.dcaCode)
                const dcaNames = await DCACode.find({code:{$in:dcaCodes}}).select('code name')
                const dcaNameMap = dcaNames.reduce((acc, dca) => {
                    acc[dca.code] = dca.name
                    return acc
                }, {})
                return{
                    ccNo,
                    ccName:costCentre ? costCentre.ccName:'Unknown',
                    ccBudget: ccBudget ? ccBudget.ccBudget:0,
                    budgetBalance: ccBudget ? ccBudget.budgetBalance : 0,
                    assignedBudget: budgets.reduce((sum, b) => sum + b.assignedBudget, 0),
                    budgets:budgets.map(budget => ({
                        dcaCode:budget.dcaCode,
                        dcaName:dcaNameMap[budget.dcaCode] || 'Unknown',
                        assignedBudget:budget.assignedBudget,
                        
                    })),
                    signatureAndRemarks
                }
            })
        )

        console.log('DCABudget with Signatures:', dcaBudgetWithSignatures)
        res.status(200).json({dcaBudgets: dcaBudgetWithSignatures})



    } catch (error) {
        console.error('Error fetching DCA Budgets for verification:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
        
    }
}
const updateDCABudget = async (req, res) => {
    try {
        const { ccNo, remarks } = req.body;
        const dcaBudgets = await DCABudget.find({ ccNo, status: 'Verification' });

        if (dcaBudgets.length === 0) {
            return res.status(404).json({ message: "No DCA Budget found for Verification" });
        }

        const permission = await Permission.findOne({ workflowId: 133 });
        if (!permission) {
            return res.status(404).json({ message: 'Permission not found' });
        }

        const { workflowDetails } = permission;

        for (const dcaBudget of dcaBudgets) {
            const { _id, levelId, ccid } = dcaBudget;

            // Filter workflow details for the specific cost centre type
            const relevantWorkflowDetails = workflowDetails.filter(detail => detail.costCentreType === ccid);

            // Find the current and next role details
            const currentRoleDetail = relevantWorkflowDetails.find(detail => detail.levelId === levelId);
            const nextRoleDetail = relevantWorkflowDetails.find(detail => detail.levelId === levelId + 1);

            await addSignatureAndRemarks(_id, req.user.roleId, levelId, remarks, req.user._id, req.user.userName);

            if (nextRoleDetail) {
                // Move to the next level
                dcaBudget.levelId = nextRoleDetail.levelId;
                await dcaBudget.save();

                // Update notification
                await NotificationHub.findOneAndUpdate(
                    { relatedEntityId: _id },
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
            } else {
                // All levels completed, approve the budget
                dcaBudget.status = 'Approved';
                await dcaBudget.save();

                await NotificationHub.findOneAndUpdate(
                    { relatedEntityId: _id },
                    { status: 'Approved' }
                );
            }
        }

        return res.status(200).json({ message: "DCA Budgets updated successfully" });
    } catch (error) {
        console.error('Error updating DCA Budget:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const rejectDCABudget = async ( req, res) => {
    try {
        const {ccNo, remarks} = req.body

        const dcaBudgets = await DCABudget.find({ccNo, status:'Verification'})

        if(dcaBudgets.length === 0){
            return res.status(404).json({message:'No DCA Budget found for verification'})
        }

        for (const dcaBudget of dcaBudgets){
            const {_id, levelId} = dcaBudget;

            dcaBudget.status = 'Rejected';
            await dcaBudget.save();

            await NotificationHub.findOneAndUpdate(
                {relatedEntityId:_id},
                {status:'Rejected'}
            )

            await addSignatureAndRemarks(_id, req.user.roleId, levelId, remarks, req.user._id, req.user.userName)

        }
        return res.status(200).json({message: 'DCA Budget rejected successfully'})
    } catch (error) {
        console.error('Error rejecting DCA Budget:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
        
    }
}



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