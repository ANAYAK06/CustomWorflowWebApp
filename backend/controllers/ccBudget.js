const CCBudget = require('../models/ccBudgetModel')
const Permission = require('../models/permissionModel')
const notificationEmitter = require('../notificationEmitter')
const NotificationHub = require('../models/notificationHubModel')
const User = require('../models/usersModel')
const UserCostCentre = require('../models/userCostCentres')
const UserRoles = require('../models/userRolesModel')
const {addSignatureAndRemarks, getSignatureandRemakrs} = require('./signatureAndRemarks')


const assignCCBudget = async (req, res)=>{
    try {
        const {ccid, subId, ccNo, ccBudget, fiscalYear, applyFiscalYear, transferPreviousYearBalance, totalBudget, remarks} = req.body

        console.log('Request body:', req.body); 

        if(!ccid || !subId || !ccNo || !ccBudget) {
            return res.status(400).json({message: 'Missing required Fields'})
        }

        const isFiscalYearApplicable = ccid === '100' || ccid === '101' || (ccid === '102' && applyFiscalYear)

        if(isFiscalYearApplicable && !fiscalYear) {
            return res.status(400).json({message:' Financial Year is required '})
        }
        
        let existingBudget

        if(isFiscalYearApplicable){
            existingBudget = await CCBudget.findOne({ccNo, fiscalYear})
        } else {
            existingBudget = await CCBudget.findOne({ccNo, fiscalYear: {$exists:false}})
        }

        if(existingBudget) {
            return res.status(400).json({message: ' Budget already assigned for this cost centre and fiscal year'})
        }

        // create new budget

        const newBudget = new CCBudget ({
            ccid,
            subId,
            ccNo,
            ccBudget: isFiscalYearApplicable && transferPreviousYearBalance ? totalBudget : ccBudget,
            applyFiscalYear:isFiscalYearApplicable,
            fiscalYear:isFiscalYearApplicable ? fiscalYear : undefined,
            budgetBalance: isFiscalYearApplicable && transferPreviousYearBalance ? totalBudget:ccBudget,
            transferredFromPreviousYear: isFiscalYearApplicable && transferPreviousYearBalance,
            levelId:1,
            status:'Verification'

        })
        
        console.log('New budget object:', newBudget);


        await newBudget.save()

        console.log('Budget saved successfully');

        if (!req.user) {
            console.error('req.user is undefined');
            return res.status(401).json({ message: 'User not authenticated' });
        }

        await addSignatureAndRemarks(newBudget._id, req.user.roleId, 1, remarks, req.user._id, req.user.userName)

        console.log('Signature and remarks added successfully');

        
        //create notification

        const permission = await Permission.findOne({workflowId:131})
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
            workflowId:131,
            roleId:workflowDetail.roleId,
            pathId:workflowDetail.pathId,
            levelId:1,
            relatedEntityId: newBudget._id,
            message:`New CC Budget Assigned : ${ccNo} ${fiscalYear ? ` for FY ${fiscalYear}`:''}`,
            status:'Pending',
            isCostCentreBased:true,
            ccCode:ccNo
        })

        await newNotification.save()

        console.log('Notification saved successfully'); //



        notificationEmitter.emit('notification', {
            userRoleId: workflowDetail.roleId,
            count:1
        })

        return res.status(201).json({
            message:`Budget successfully assigned${fiscalYear ? ` for fiscal year ${fiscalYear}` : ''}.`,
            budget:newBudget,
            notification:newNotification
        })

    } catch (error) {
        return res.status(500).json({ message: 'An error occurred while assigning the budget.', error: error.message, stack: error.stack  })
        
    }

}



const getCCBudgetForVerification = async (req, res)=>{
   
    const userRoleId = parseInt(req.query.userRoleId);
   

    try {

      
        
        const userRole = await UserRoles.findOne({roleId:userRoleId})
        if(!userRole){
            return res.status(404).json({message:'No user Role found'})
        }

        const permission = await Permission.findOne({workflowId:131})
        if(!permission){
            return res.status(404).json({message: 'Work flow Not found'})
        }
        const relventworkflowDetails = permission.workflowDetails.filter(
            detail => detail.roleId === userRoleId &&
            (!userRole.isCostCentreApplicable || userRole.costCentreTypes.includes(detail.costCentreType))
        )
        if(relventworkflowDetails.length === 0) {
            return res.status(404).json({message: ' No matching workflow details found'})
        }

        const notifications = await NotificationHub.find({
            workflowId: 131,
            roleId: userRoleId,
            pathId: {$in: relventworkflowDetails.map(detail => detail.pathId)},
            status:'Pending'
        });
        if(!notifications.length){
            return res.status(200).json({message: 'No pending notification available ', ccBudgets:[]})
        }

        const ccBudgetIds = notifications.map(notification => notification.relatedEntityId)
        let ccBudgetQuery = {
            _id: {$in: ccBudgetIds},
            status: 'Verification',
            levelId: { $in: relventworkflowDetails.map(detail => detail.levelId)},
            
        }

        if(userRole.isCostCentreApplicable){
            const userCostCentres = await UserCostCentre.findOne({userId:req.user._id, roleId:userRoleId})
            if(!userCostCentres || !userCostCentres.costCentreId.length){
                return res.status(200).json({message: ' No cost centre assigned to this user', ccBudgets:[]})
            }
            

            ccBudgetQuery.ccid = {$in: userRole.costCentreTypes};
            ccBudgetQuery.ccNo = { $in: userCostCentres.costCentreId}
        }

        const ccBudgets = await CCBudget.find(ccBudgetQuery)

        if(!ccBudgets.length){
            return res.status(200).json({message: ' No CC Budget found for verification', ccBudgets:[]})
        }

        const ccBudgetWithSignatures = await Promise.all(ccBudgets.map(async(budget) => {
            const signatureAndRemarks = await getSignatureandRemakrs(budget._id);

            return{
                ...budget.toObject(),
                signatureAndRemarks
            }
        }))
        console.log('CCBudgets with signatures:', ccBudgetWithSignatures);
        res.status(200).json({ccBudgets: ccBudgetWithSignatures})

        
        
    } catch (error) {
        console.error('Error fetching CC Budgets for verification:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
        
    }
}


const updateCCBudget = async (req, res) => {
    try {
         const {id} = req.params;
         const {remarks} =req.body
         const ccBudget = await CCBudget.findById(id)

         if(!ccBudget){
            return res.status(404).json({message:"No CC Budget for Verification"})
         }
         const {workflowId, levelId, ccid} = ccBudget;
         const permission = await Permission.findOne({workflowId:131})

         if(!permission){
            return res.status(404).json({message: 'Permission not found'})
         }

         const {workflowDetails} = permission

           // Filter workflow details for the specific cost centre type
        const relventworkflowDetails = workflowDetails.filter(detail => detail.costCentreType === parseInt(ccid))

         // Find the current and next role details
         const currentRoleDetail = relventworkflowDetails.find(detail => detail.levelId === levelId);
         const nextRoleDetail = relventworkflowDetails.find(detail => detail.levelId === levelId + 1)


         await addSignatureAndRemarks(id, req.user.roleId, levelId, remarks, req.user._id, req.user.userName)

         if(nextRoleDetail){
            ccBudget.levelId = nextRoleDetail.levelId
            await ccBudget.save()

            await NotificationHub.findOneAndUpdate(
                {relatedEntityId:id},
                {
                    levelId:nextRoleDetail.levelId,
                    roleId:nextRoleDetail.roleId,
                    pathId:nextRoleDetail.pathId,
                    status:'Pending'
                }
            );
            notificationEmitter.emit('notification', {
                userRoleId:nextRoleDetail.roleId,
                count:1
            })

            return res.status(200).json({message:"CC Budget updated to next level" , ccBudget})
         } else {
            ccBudget.status = 'Approved';
            await ccBudget.save()

            await NotificationHub.findOneAndUpdate(
                {
                    relatedEntityId:id
                },
                {
                    status:'Approved'
                }
            )
            return res.status(200).json({message:"Budget Approved Successfully"})
         }
    } catch (error) {
        console.error('Error updating CC Budget:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
        
    }
}



module.exports = {
    assignCCBudget, 
    getCCBudgetForVerification,
    updateCCBudget
}