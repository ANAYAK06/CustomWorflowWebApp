const mongoose = require('mongoose');
const AccountGroup = require('../models/accountsGroupsModel');
const Permission = require('../models/permissionModel');
const notificationEmitter = require('../notificationEmitter');
const NotificationHub = require('../models/notificationHubModel');
const UserRoles = require('../models/userRolesModel')
const { addSignatureAndRemarks, getSignatureandRemakrs } = require('./signatureAndRemarks');



const getAllGroupDetails = async(req, res)=>{
    try {
        const response = await AccountGroup.find()
        res.status(200).json(response)
        
        
    } catch (error) {
        res.status(400).json({error:error.message})
    }
}



const createAccountsGroup = async(req,res)=>{
    try {
        const newAccountGroup = new AccountGroup({
            groupId:req.body.groupId,
            groupName:req.body.groupName,
            groupUnder: req.body.groupUnder,
            natureId: req.body.natureId,
            affectsGrossProfit: req.body.affectsGrossProfit,
            reportIndex: req.body.reportIndex,
            reportType: req.body.reportType,
            isBuiltIn: req.body.isBuiltIn
        })

        const savedAccountGroup = await newAccountGroup.save()
        res.status(201).json(savedAccountGroup);
        
    } catch (error) {
        res.status(400).json({ message: error.message });
        
    }
}

const checkGroupNameExists = async( req, res) => {
    try {
        const {groupName} = req.query
        if(!groupName){
            return res.status(400).json({message: "Ledger name required"})
        }   

        const existingLedger = await AccountGroup.findOne({groupName: {$regex: new RegExp(`${groupName}$`,'i')}})

        if(existingLedger){
            return res.json({exists: true, message: 'Group Name is already exists'})
        } else {
        return res.json({exists:false, message: 'Group Name is available'})
        }
    } catch (error) {
        console.error('Error checking ledger name:', error);
        res.status(500).json({ message: 'An error occurred while checking the ledger name', error: error.message });
        
    }
}




const createSubgroup = async (req, res) => {
    try {
        const { groupName, groupUnder, remarks } = req.body;

        // Check for existing group name
        const existingGroup = await AccountGroup.findOne({ groupName: { $regex: new RegExp(`^${groupName}$`, 'i') } });
        if (existingGroup) {
            return res.status(400).json({ message: "Group Name already exists" });
        }

        // Fetch the parent group by ID
        const parentGroup = await AccountGroup.findById(groupUnder);
        if (!parentGroup) {
            return res.status(404).json({ message: 'Parent group not found' });
        }

        // Find the highest reportIndex among existing subgroups
        const highestSubgroup = await AccountGroup.findOne({ groupUnder: parentGroup.groupName })
            .sort('-reportIndex')
            .limit(1);

        const newReportIndex = highestSubgroup 
            ? highestSubgroup.reportIndex + 1 
            : parentGroup.reportIndex + 1;

        // Create the new subgroup
        const newSubgroup = new AccountGroup({
            groupName,
            groupUnder: parentGroup.groupName,
            groupId: await getNextGroupId(),
            natureId: parentGroup.natureId,
            affectsGrossProfit: parentGroup.affectsGrossProfit,
            reportType: parentGroup.reportType,
            reportIndex: newReportIndex,
            isBuiltIn: false,
            status: 'Verification',
            levelId: 1
        });

        await newSubgroup.save();

        // Add signature and remarks
        await addSignatureAndRemarks(newSubgroup._id, req.user.roleId, 1, remarks, req.user._id, req.user.userName);

        // Check permissions and create notification
        const permission = await Permission.findOne({ workflowId: 138 }); // Assuming 138 is for subgroup creation
        if (!permission) {
            return res.status(404).json({ message: "Workflow not found" });
        }

        const workflowDetail = permission.workflowDetails.find(detail => detail.levelId === 1);
        if (!workflowDetail) {
            return res.status(404).json({ message: 'Workflow detail not found' });
        }

        const newNotification = new NotificationHub({
            workflowId: 138,
            roleId: workflowDetail.roleId,
            pathId: workflowDetail.pathId,
            levelId: 1,
            relatedEntityId: newSubgroup._id,
            message: `New Subgroup Created: ${groupName}`,
            status: 'Pending'
        });
        await newNotification.save();

        notificationEmitter.emit('notification', {
            userRoleId: workflowDetail.roleId,
            count: 1
        });

        res.status(201).json({
            message: 'Subgroup Created successfully and sent for verification',
            subgroup: newSubgroup,
            notification: newNotification
        });
    } catch (error) {
        console.error('Error creating subgroup:', error);
        res.status(500).json({ message: 'An error occurred while creating the subgroup', error: error.message });
    }
};

// Helper function to get the next available groupId
async function getNextGroupId() {
    const highestGroup = await AccountGroup.findOne().sort('-groupId').limit(1);
    return highestGroup ? highestGroup.groupId + 1 : 1;
}

const getGroupsForVerification = async (req, res) => {
    const userRoleId = parseInt(req.query.userRoleId);
    try {
        if (isNaN(userRoleId)) {
            return res.status(400).json({ message: 'Invalid userRoleId provided' });
        }

        const userRole = await UserRoles.findOne({ roleId: userRoleId });
        if (!userRole) {
            return res.status(404).json({ message: 'No user role found' });
        }

        const permission = await Permission.findOne({ workflowId: 138 }); // Assuming 138 is for group workflow
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
            workflowId: 138,
            roleId: userRoleId,
            pathId: { $in: relevantWorkflowDetails.map(detail => detail.pathId) },
            status: 'Pending'
        });

        if (!notifications.length) {
            return res.status(200).json({ message: 'No pending notification available', groups: [] });
        }

        const groupIds = notifications.map(notification => notification.relatedEntityId);

        let groupQuery = {
            _id: { $in: groupIds },
            status: 'Verification',
            levelId: { $in: relevantWorkflowDetails.map(detail => detail.levelId) }
        };

        const groups = await AccountGroup.find(groupQuery);

        if (!groups.length) {
            return res.status(200).json({ message: 'No groups found for verification', groups: [] });
        }

        const groupsWithSignatures = await Promise.all(groups.map(async (group) => {
            const signatureAndRemarks = await getSignatureandRemakrs(group._id);
            return {
                ...group.toObject(),
                signatureAndRemarks
            };
        }));

        res.status(200).json({ groups: groupsWithSignatures });

    } catch (error) {
        console.error('Error fetching groups for verification:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateGroup = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        const group = await AccountGroup.findById(id);

        if (!group) {
            return res.status(404).json({ message: "No group available for verification" });
        }

        const { levelId } = group;
        const permission = await Permission.findOne({ workflowId: 138 });
        if (!permission) {
            return res.status(404).json({ message: 'Permission not found' });
        }

        const { workflowDetails } = permission;
        const currentRoleDetail = workflowDetails.find(detail => detail.levelId === levelId);
        const nextRoleDetail = workflowDetails.find(detail => detail.levelId === levelId + 1);

        await addSignatureAndRemarks(id, req.user.roleId, levelId, remarks, req.user._id, req.user.userName);

        if (nextRoleDetail) {
            group.levelId = nextRoleDetail.levelId;
            await group.save();

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

            return res.status(200).json({ message: "Group updated to next level", group });
        } else {
            group.status = 'Approved';
            await group.save();

            await NotificationHub.findOneAndUpdate(
                { relatedEntityId: id },
                { status: 'Approved' }
            );

            return res.status(200).json({ message: "Group Approved Successfully" });
        }

    } catch (error) {
        res.status(500).json({ message: 'An error occurred while updating the group', error: error.message });
    }
};

const rejectGroup = async (req, res) => {
    try {
        const {id} = req.params
        const {remarks } = req.body;

        const group = await AccountGroup.findOne({ _id: id, status: 'Verification' });

        if (!group) {
            return res.status(404).json({ message: 'No Group found for verification' });
        }

        const { _id, levelId } = group;

        group.status = 'Rejected';
        await group.save();

        // Update the existing notification
        await NotificationHub.findOneAndUpdate(
            { relatedEntityId: _id },
            { status: 'Rejected' }
        );

        // Add signature and remarks
        await addSignatureAndRemarks(_id, req.user.roleId, levelId, remarks, req.user._id, req.user.userName);

        return res.status(200).json({ message: 'Group rejected successfully' });
    } catch (error) {
        console.error('Error rejecting Group:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};




module.exports = {
    getAllGroupDetails,
    createAccountsGroup,
    createSubgroup,
    checkGroupNameExists,
    getGroupsForVerification,
    updateGroup,
    rejectGroup

}