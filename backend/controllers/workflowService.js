// workflowService.js - Enhanced for cost center support

const NotificationHub = require('../models/notificationHubModel');
const Permission = require('../models/permissionModel');
const UserRoles = require('../models/userRolesModel');
const UserCostCentre = require('../models/userCostCentres');
const { addSignatureAndRemarks, getSignatureandRemakrs } = require('../controllers/signatureAndRemarks');
const notificationEmitter = require('../notificationEmitter');

class WorkflowService {
    constructor(config) {
        this.workflowId = config.workflowId;
        this.Model = config.Model;
        this.entityType = config.entityType;
        this.getNotificationMessage = config.getNotificationMessage;
        this.isCostCentreApplicable = config.isCostCentreApplicable || false;
        this.costCentreIdField = config.costCentreIdField || 'ccNo';
        this.costCentreTypeField = config.costCentreTypeField || 'ccid';
    }

    async checkRoleApproval(entityId, roleId, levelId, specificationId = null) {
        // No changes needed here
        const entity = await this.Model.findById(entityId);
        if (!entity) {
            throw new Error(`${this.entityType} not found`);
        }

        const query = {
            entityId,
            levelId,
            roleId,
            workflowId: this.workflowId,
            ...(specificationId && { specificationId })
        };

        const signatures = await getSignatureandRemakrs.find(query);
        if (signatures.length > 0) {
            throw new Error(`This ${this.entityType} has already been processed at your role level`);
        }

        return entity;
    }

    async getWorkflowPermissions(userRoleId) {
        const permission = await Permission.findOne({ workflowId: this.workflowId });
        if (!permission) {
            throw new Error('Workflow not found');
        }

        // Get user role to check if cost center applicable
        const userRole = await UserRoles.findOne({ roleId: userRoleId });
        if (!userRole) {
            throw new Error('User role not found');
        }

        let relevantWorkflowDetails;
        
        if (this.isCostCentreApplicable) {
            // Filter details by role and cost center types if applicable
            relevantWorkflowDetails = permission.workflowDetails.filter(
                detail => detail.roleId === userRoleId && 
                (!userRole.isCostCentreApplicable || userRole.costCentreTypes.includes(detail.costCentreType))
            );
        } else {
            // Standard workflow filtering by role only
            relevantWorkflowDetails = permission.workflowDetails.filter(
                detail => detail.roleId === userRoleId
            );
        }

        if (relevantWorkflowDetails.length === 0) {
            throw new Error('Access denied: No matching workflow details found for this role');
        }

        return {
            permission,
            relevantWorkflowDetails,
            userRole
        };
    }

    async createEntity(data, user, remarks) {
        const entity = new this.Model({
            ...data,
            status: 'Verification',
            levelId: 1
        });

        await entity.save();

        // Add initial signature
        await addSignatureAndRemarks(
            entity._id,
            user.roleId,
            0,
            remarks || `${this.entityType} Created`,
            user._id,
            user.userName
        );

        // Create notification
        const { permission, userRole } = await this.getWorkflowPermissions(user.roleId);
        
        // Find appropriate workflow detail - for cost center consider costCentreType
        let workflowDetail;
        
        if (this.isCostCentreApplicable && data[this.costCentreTypeField]) {
            workflowDetail = permission.workflowDetails.find(
                detail => detail.levelId === 1 && 
                detail.costCentreType === parseInt(data[this.costCentreTypeField])
            );
        } else {
            workflowDetail = permission.workflowDetails.find(detail => detail.levelId === 1);
        }
        
        if (!workflowDetail) {
            throw new Error('Workflow detail not found');
        }

        const notification = await this.createNotification(entity, workflowDetail);

        return { entity, notification };
    }

    async createNotification(entity, workflowDetail) {
        const notificationData = {
            workflowId: this.workflowId,
            roleId: workflowDetail.roleId,
            pathId: workflowDetail.pathId,
            levelId: workflowDetail.levelId,
            relatedEntityId: entity._id,
            message: this.getNotificationMessage(entity, 'created'),
            status: 'Pending'
        };

        // Add cost center fields if applicable
        if (this.isCostCentreApplicable && entity[this.costCentreIdField]) {
            notificationData.isCostCentreBased = true;
            notificationData.ccCode = entity[this.costCentreIdField];
        }

        const notification = new NotificationHub(notificationData);
        await notification.save();

        notificationEmitter.emit('notification', {
            userRoleId: workflowDetail.roleId,
            count: 1
        });

        return notification;
    }

    async verifyEntity(entityId, user, remarks) {
        try {
            // Find the entity
            const entity = await this.Model.findById(entityId);
            if (!entity) {
                throw new Error(`${this.entityType} not found`);
            }

            // Get workflow permissions
            const { permission, userRole } = await this.getWorkflowPermissions(user.roleId);

            // Add signature and remarks
            await addSignatureAndRemarks(
                entityId,
                user.roleId,
                entity.levelId,
                remarks,
                user._id,
                user.userName
            );

            // Find next level details - considering cost center type if applicable
            let nextRoleDetail;
            
            if (this.isCostCentreApplicable && entity[this.costCentreTypeField]) {
                // Filter workflow by cost center type first
                const relevantWorkflowDetails = permission.workflowDetails.filter(
                    detail => detail.costCentreType === entity[this.costCentreTypeField]
                );
                
                nextRoleDetail = relevantWorkflowDetails.find(
                    detail => detail.levelId === entity.levelId + 1
                );
            } else {
                nextRoleDetail = permission.workflowDetails.find(
                    detail => detail.levelId === entity.levelId + 1
                );
            }

            if (nextRoleDetail) {
                // Move to next level
                entity.levelId = nextRoleDetail.levelId;
                await entity.save();

                // Update notification
                await this.updateNotification(
                    entityId,
                    'Pending',
                    this.getNotificationMessage(entity, 'nextLevel'),
                    nextRoleDetail
                );

                // Emit notification
                notificationEmitter.emit('notification', {
                    userRoleId: nextRoleDetail.roleId,
                    count: 1
                });
            } else {
                // Final approval
                entity.status = 'Approved';
                await entity.save();

                // Update notification
                await this.updateNotification(
                    entityId,
                    'Approved',
                    this.getNotificationMessage(entity, 'approved')
                );
            }

            // Get updated signatures
            const signatureAndRemarks = await getSignatureandRemakrs(entityId);

            return {
                success: true,
                message: nextRoleDetail ? 
                    `${this.entityType} moved to next level` : 
                    `${this.entityType} approved successfully`,
                data: {
                    ...entity.toObject(),
                    signatureAndRemarks
                }
            };
        } catch (error) {
            console.error('WorkflowService verifyEntity error:', error);
            throw error;
        }
    }

    async rejectEntity(entityId, user, remarks, metadata = null) {
        const entity = await this.Model.findById(entityId);
        if (!entity) {
            throw new Error(`${this.entityType} not found`);
        }

        // Update status
        entity.status = 'Rejected';
        if (metadata?.specificField) {
            entity[metadata.specificField] = 'Rejected';
        }
        await entity.save();

        // Update notification
        await this.updateNotification(
            entityId,
            'Rejected',
            this.getNotificationMessage(entity, 'rejected'),
            null,
            metadata
        );

        // Add signature
        await addSignatureAndRemarks(
            entityId,
            user.roleId,
            entity.levelId,
            remarks,
            user._id,
            user.userName,
            metadata?.specificationId
        );

        const signatureAndRemarks = await getSignatureandRemakrs(
            entityId,
            metadata?.specificationId
        );

        return {
            success: true,
            message: `${this.entityType} rejected successfully`,
            data: {
                ...entity.toObject(),
                signatureAndRemarks
            }
        };
    }

    async getEntitiesForVerification(userRoleId, userId) {
        try {
            const { relevantWorkflowDetails, userRole } = await this.getWorkflowPermissions(userRoleId);

            const notifications = await NotificationHub.find({
                workflowId: this.workflowId,
                roleId: userRoleId,
                pathId: { $in: relevantWorkflowDetails.map(detail => detail.pathId) },
                status: 'Pending'
            });

            if (!notifications.length) {
                return {
                    success: true,
                    message: `No pending ${this.entityType}s for verification`,
                    data: []
                };
            }

            const entityIds = notifications.map(n => n.relatedEntityId);

            let entityQuery = {
                _id: { $in: entityIds },
                status: 'Verification',
                levelId: { $in: relevantWorkflowDetails.map(detail => detail.levelId) }
            };

            // Apply cost center filtering if applicable
            if (this.isCostCentreApplicable && userRole.isCostCentreApplicable) {
                const userCostCentres = await UserCostCentre.findOne({
                    userId: userId,
                    roleId: userRoleId
                });
                
                if (!userCostCentres || !userCostCentres.costCentreId.length) {
                    return {
                        success: true,
                        message: "No cost centre assigned to this user",
                        data: []
                    };
                }

                entityQuery[this.costCentreTypeField] = { $in: userRole.costCentreTypes };
                entityQuery[this.costCentreIdField] = { $in: userCostCentres.costCentreId };
            }

            const entities = await this.Model.find(entityQuery);

            if (!entities.length) {
                return {
                    success: true,
                    message: `No ${this.entityType}s found for verification`,
                    data: []
                };
            }

            const entitiesWithSignatures = await Promise.all(
                entities.map(async (entity) => ({
                    ...entity.toObject(),
                    signatureAndRemarks: await getSignatureandRemakrs(entity._id)
                }))
            );

            return {
                success: true,
                message: `${this.entityType}s retrieved successfully`,
                data: entitiesWithSignatures
            };
        } catch (error) {
            console.error(`Error getting ${this.entityType}s for verification:`, error);
            throw error;
        }
    }

    async updateNotification(entityId, status, message, nextLevel = null, metadata = null) {
        const query = { 
            relatedEntityId: entityId,
            status: 'Pending'
        };

        if (metadata?.specificationId) {
            query['metadata.specificationId'] = metadata.specificationId;
        }

        const update = {
            status,
            message,
            updatedAt: new Date(),
            ...(nextLevel && {
                levelId: nextLevel.levelId,
                roleId: nextLevel.roleId,
                pathId: nextLevel.pathId
            })
        };

        return await NotificationHub.findOneAndUpdate(query, update, { new: true });
    }
}

module.exports = WorkflowService;