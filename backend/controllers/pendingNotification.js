

const Notification = require('../models/notificationHubModel');
const Permission = require('../models/permissionModel');

const getPendingWorkflows = async (req, res) => {
    const { id } = req.params;
    
    try {
        // Get the workflow to understand the hierarchy structure
        const workflow = await Permission.findOne({ workflowId: parseInt(id) });
        if (!workflow) {
            return res.status(404).json({ error: 'Workflow not found' });
        }
        
        // Find all notifications related to this workflow that are not "Approved"
        const pendingNotifications = await Notification.find({
            workflowId: parseInt(id),
            status: { $ne: 'Approved' }
        });
        
        // If no pending notifications, return empty result
        if (pendingNotifications.length === 0) {
            return res.status(200).json([]);
        }
        
        // Create a map of which roles have pending items and at what level
        const pendingByRole = {};
        
        // Process each pending notification
        pendingNotifications.forEach(notification => {
            const { roleId, levelId, pathId, costCentreType } = notification;
            
            // If this workflow has cost center types
            if (workflow.isCostCentreApplicable) {
                // Create a key based on roleId and costCentreType
                workflow.workflowDetails.forEach(detail => {
                    // Check if this role's levelId is less than or equal to the pending notification's levelId
                    // and they share the same costCentreType and pathId
                    if (detail.costCentreType === costCentreType && 
                        detail.pathId === pathId && 
                        detail.levelId <= levelId) {
                        const key = `${detail.roleId}-${costCentreType}`;
                        pendingByRole[key] = true;
                    }
                });
            } else {
                // For workflows without cost center types
                workflow.workflowDetails.forEach(detail => {
                    // Check if this role's levelId is less than or equal to the pending notification's levelId
                    // and they have the same pathId
                    if (detail.pathId === pathId && detail.levelId <= levelId) {
                        const key = `${detail.roleId}`;
                        pendingByRole[key] = true;
                    }
                });
            }
        });
        
        // Transform the pendingByRole map into an array of results
        const result = Object.keys(pendingByRole).map(key => {
            // For keys with costCentreType (format: "roleId-costCentreType")
            if (key.includes('-')) {
                const [roleId, costCentreType] = key.split('-');
                return {
                    roleId: parseInt(roleId),
                    costCentreType: parseInt(costCentreType),
                    isPending: true
                };
            } else {
                // For keys without costCentreType (just roleId)
                return {
                    roleId: parseInt(key),
                    isPending: true
                };
            }
        });
        
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching pending workflows:', error);
        res.status(500).json({ error: error.message });
    }
};

// This function checks if a workflow can be deleted
const canDeleteWorkflow = async (req, res) => {
    const { id } = req.params;
    
    try {
        // Check if there are any pending notifications for this workflow
        const pendingCount = await Notification.countDocuments({
            workflowId: parseInt(id),
            status: { $ne: 'Approved' }
        });
        
        if (pendingCount > 0) {
            return res.status(200).json({ 
                canDelete: false, 
                message: 'Cannot delete workflow as there are pending items' 
            });
        }
        
        res.status(200).json({ canDelete: true });
    } catch (error) {
        console.error('Error checking if workflow can be deleted:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = { getPendingWorkflows, canDeleteWorkflow };