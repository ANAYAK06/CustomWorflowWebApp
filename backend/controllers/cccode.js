const CostCentre = require('../models/costCentreModel')
const Permission = require('../models/permissionModel')
const notificationEmitter = require('../notificationEmitter')
const NotificationHub = require('../models/notificationHubModel')
const CCBudget = require('../models/ccBudgetModel')

const mongoose = require('mongoose')



//Create new cost Centre

const createNewCostCentre = async (req, res)=>{
    
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
            voucherLimit

        } = req.body

        const prefixedCcNo = `CC-${ccNo}`

        const existingCostCentre = await CostCentre.findOne({ccNo:prefixedCcNo})
        
        if(existingCostCentre){
            
            
            return res.status(400).json({message:'CC Number Already taken'})
        }
        const existingCCName = await CostCentre.findOne({ccName})

        if(existingCCName){
            
            return res.status(400).json({message:"Name already existing"})
        }

        const newCostCentre = new CostCentre({
            ccType,
            subCCType,
            ccNo:prefixedCcNo,
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
            levelId: 1, 
            status: 'Verification'
        });
        await newCostCentre.save()

        


        // Fetch workflowId and roleId  for notification

        const permission = await Permission.findOne({workflowId:128})
        if(!permission){
           
            return res.status(404).json({message:'Permission not found'})
        }
        const {workflowId, workflowDetails} = permission
        const roleDetail = workflowDetails.find(detail=> detail.levelId === 1);
        if(!roleDetail){
           
            return res.status(404).json({message:'Role details not found'})
        }

        //create notification
        const newNotification = new NotificationHub({
            workflowId,
            roleId:roleDetail.roleId,
            pathId:1,
            levelId:1,
            relatedEntityId:newCostCentre._id,
            message:`New Cost Centre Created: ${ccName}`,
            status:'Pending'

        })
        console.log('Notification Hub',newNotification)

        await newNotification.save()

        // emit notification
        notificationEmitter.emit('notification',{
            userRoleId:roleDetail.roleId,
            count:1
        })


        

    
        
         res.status(201).json({newCostCentre, newNotification})
        
    } catch (error) {
        
        console.error('Error for creating cost centre :', error)
        res.status(500).json({ message: 'Server error', error });
        
    }
}

// get All CC Data

const getAllCostCentreData = async(req, res)=>{
    const CCDetails = await CostCentre.find({}).sort({createdAt: -1})
    res.status(200).json(CCDetails)
}

// get new CC Data for verification next level 

const getCCDataforVerification = async(req, res)=>{
    const userRoleId = parseInt(req.query.userRoleId)
    
    try {
        const notifications = await NotificationHub.find({roleId:userRoleId, status:'Pending'})
       

        if(!notifications.length){
            return res.status(200).json({message:'No Pending Notification available', costCentres:[]})
        }
        
        const costCentreIds = notifications.map(notification=>notification.relatedEntityId)
        

        const costCentres = await CostCentre.find({
            _id:{ $in:costCentreIds },
            status:'Verification'
        })
        if(!costCentres.length){
            return res.status(200).json({message:'No cost centre data for verification'})
        }
        res.status(200).json(costCentres)
    } catch (error) {
        console.error('Error fetching cost centers by role:', error);
        res.status(500).json({ message: 'Server error', error });
        
    }
}

const updateCostCentre = async (req, res)=>{
    try {
        const {id} = req.params;
        const costCentre = await CostCentre.findById(id)

        if(!costCentre){
            return res.status(404).json({message:"No cost centre for verification"})
        }
        const {workflowId, levelId} = costCentre;
        const permission = await Permission.findOne({workflowId:128})
       

        if(!permission){
            return res.status(404).json({message:'Permission not found'})
        }
        const {workflowDetails} = permission
        const currentRoleDetail = workflowDetails.find(detail=>detail.levelId === levelId)
        const nextRoleDetail = workflowDetails.find(detail=>detail.levelId === levelId + 1)

        if(nextRoleDetail){
            costCentre.levelId = nextRoleDetail.levelId
            await costCentre.save()

            await NotificationHub.findOneAndUpdate(
                {relatedEntityId:id},
                {
                    levelId:nextRoleDetail.levelId,
                    roleId:nextRoleDetail.roleId,
                    status:'Pending'
                }

                
            );

            //Emit notification

            notificationEmitter.emit('notification', {
                userRoleId:nextRoleDetail.roleId,
                count:1
            })
            

            return res.status(200).json({message:'Cost Centre updated to next level', costCentre})
        } else {
            costCentre.status = 'Approved'
            await costCentre.save();

            await NotificationHub.findOneAndUpdate(
                {
                    relatedEntityId:id
                },
                {
                    status:'Approved'
                }
            );
            
            return res.status(200).json({message:'Cost Centre Approved Successfully'})
        }
        
    } catch (error) {
        console.error('Error updating cost centre:', error);
        res.status(500).json({ message: 'Server error', error });
        
    }
}

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

const rejectCostCentre = async (req, res)=>{
    try {
        const {id} = req.params

        const costCentre = await CostCentre.findById(id)
        if(!costCentre){
            return res.status(404).json({messge:'Cost Centre not found'})
        }
        costCentre.status = 'Rejected';
        await costCentre.save()

        await NotificationHub.findOneAndUpdate(
            {relatedEntityId:id},
            {status:'Rejected'}
        )
        res.status(200).json({message:'Cost Centre rejected successfully', costCentre})
        
    } catch (error) {
        console.error('Error rejecting cost centre:', error);
        res.status(500).json({ message: 'Server error', error })
        
    }
}

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
    getEligibleCCForBudgetAssign
}