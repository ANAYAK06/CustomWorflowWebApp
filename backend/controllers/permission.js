const Permission = require('../models/permissionModel');
const Notification = require('../models/notificationHubModel');

// Create a new workflow
const createPermission = async(req, res) => {
    const {workflowId, workflowname, isCostCentreApplicable, workflowDetails} = req.body;

    try {
        // Check if workflow already exists
        const existingWorkflow = await Permission.findOne({workflowId});
        if(existingWorkflow) {
            return res.status(400).json({
                error: 'Workflow with this ID already exists. Use the update endpoint.'
            });
        }

        // Create new workflow
        const workflow = new Permission({
            workflowId,
            workflowname,
            isCostCentreApplicable,
            workflowDetails
        });

        const savedWorkflow = await workflow.save();
        res.status(201).json({
            message: 'Workflow created successfully', 
            workflow: savedWorkflow
        });
    } catch (error) {
        console.error('Error creating workflow', error);
        res.status(500).json({error: 'Internal server error'});
    }
};

// Update an existing workflow
const updatePermission = async(req, res) => {
    const { id } = req.params;
    const {workflowname, isCostCentreApplicable, workflowDetails} = req.body;

    try {
        // Find the workflow
        const workflow = await Permission.findOne({workflowId: id});
        if(!workflow) {
            return res.status(404).json({error: 'Workflow not found'});
        }

        // Check for pending workflows
        const pendingNotifications = await Notification.find({
            workflowId: parseInt(id),
            status: { $ne: 'Approved' }
        });
        
        if (pendingNotifications.length > 0) {
            // Create a map of roles that cannot be modified
            const lockedRoles = {};
            
            pendingNotifications.forEach(notification => {
                const { levelId, pathId, costCentreType } = notification;
                
                // Find all roles at or below the level of the pending item
                workflow.workflowDetails.forEach(detail => {
                    const isSamePathAndType = 
                        (!isCostCentreApplicable && detail.pathId === pathId) || 
                        (isCostCentreApplicable && detail.pathId === pathId && detail.costCentreType === costCentreType);
                        
                    if (isSamePathAndType && detail.levelId <= levelId) {
                        const key = isCostCentreApplicable 
                            ? `${detail.roleId}-${detail.costCentreType}`
                            : `${detail.roleId}`;
                        lockedRoles[key] = true;
                    }
                });
            });
            
            // Check if any locked roles are being modified
            let isModifyingLockedRole = false;
            let lockedRoleDetails = [];
            
            for (const newDetail of workflowDetails) {
                // Find the corresponding existing detail
                const existingDetail = workflow.workflowDetails.find(d => 
                    (isCostCentreApplicable && d.costCentreType === newDetail.costCentreType && d.levelId === newDetail.levelId) ||
                    (!isCostCentreApplicable && d.levelId === newDetail.levelId)
                );
                
                if (existingDetail) {
                    const key = isCostCentreApplicable
                        ? `${existingDetail.roleId}-${existingDetail.costCentreType}`
                        : `${existingDetail.roleId}`;
                        
                    if (lockedRoles[key] && existingDetail.roleId !== newDetail.roleId) {
                        isModifyingLockedRole = true;
                        lockedRoleDetails.push({
                            roleId: existingDetail.roleId,
                            levelId: existingDetail.levelId,
                            costCentreType: existingDetail.costCentreType || null
                        });
                    }
                }
            }
            
            if (isModifyingLockedRole) {
                return res.status(400).json({
                    error: 'Cannot modify roles that have pending workflow items',
                    lockedRoles: lockedRoleDetails
                });
            }
        }
        
        // Update the workflow
        workflow.workflowname = workflowname;
        workflow.isCostCentreApplicable = isCostCentreApplicable;
        workflow.workflowDetails = workflowDetails;
        
        const updatedWorkflow = await workflow.save();
        res.status(200).json({
            message: 'Workflow updated successfully', 
            workflow: updatedWorkflow
        });
    } catch (error) {
        console.error('Error updating workflow', error);
        res.status(500).json({error: 'Internal server error'});
    }
};

// For backward compatibility - will route to create or update based on whether the workflow exists
const savePermission = async(req, res) => {
    const {workflowId} = req.body;

    try {
        const existingWorkflow = await Permission.findOne({workflowId});
        
        if (existingWorkflow) {
            // If workflow exists, treat as update
            req.params.id = workflowId;
            return updatePermission(req, res);
        } else {
            // If workflow doesn't exist, treat as create
            return createPermission(req, res);
        }
    } catch (error) {
        console.error('Error in save permission', error);
        res.status(500).json({error: 'Internal server error'});
    }
};

const getPermission = async(req, res) => {
    try {
        const userpermission = await Permission.find({});
        res.status(200).json(userpermission);
    } catch (error) {
        res.status(400).json({error: error.message});
    }
};

const getPermissionById = async(req, res) => {
    const { id } = req.params;
    
    try {
        const workflow = await Permission.findOne({ workflowId: id });
        if (!workflow) {
            return res.status(404).json({ error: 'Workflow not found' });
        }
        res.status(200).json(workflow);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const getPermissionRoleBase = async(req, res) => {
    const {roleId} = req.query;

    try {
        let query = {};
        if(roleId){
            query = {roleId: roleId};
        }
        const userpermission = await Permission.find(query);
        res.status(200).json(userpermission);
    } catch (error) {
        res.status(400).json({ error: error.message});
    }
};

const deletePermission = async(req, res) => {
    const { id } = req.params;
    
    try {
        // Check if there are any pending notifications for this workflow
        const pendingCount = await Notification.countDocuments({
            workflowId: parseInt(id),
            status: { $ne: 'Approved' }
        });
        
        if (pendingCount > 0) {
            return res.status(400).json({ 
                error: 'Cannot delete workflow as there are pending items' 
            });
        }
        
        // If no pending items, proceed with deletion
        const workflow = await Permission.findOneAndDelete({ workflowId: id });
        if (!workflow) {
            return res.status(404).json({ error: 'Workflow not found' });
        }
        res.status(200).json({ message: 'Workflow deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    savePermission,      // Legacy method (handles both create and update)
    createPermission,    // New method for create only
    updatePermission,    // New method for update only
    getPermission, 
    getPermissionRoleBase, 
    getPermissionById, 
    deletePermission
};