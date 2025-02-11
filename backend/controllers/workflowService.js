// workflowService.js

const NotificationHub = require('../models/notificationHubModel');
const Permission = require('../models/permissionModel');
const { addSignatureAndRemarks, getSignatureandRemakrs } = require('../controllers/signatureAndRemarks');
const notificationEmitter = require('../notificationEmitter');

class WorkflowService {
    constructor(config) {
        this.workflowId = config.workflowId;
        this.Model = config.Model;
        this.entityType = config.entityType;
        this.getNotificationMessage = config.getNotificationMessage;
    }

    async checkRoleApproval(entityId, roleId, levelId, specificationId = null) {
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

        const relevantWorkflowDetails = permission.workflowDetails.filter(
            detail => detail.roleId === userRoleId
        );

        if (relevantWorkflowDetails.length === 0) {
            throw new Error('Access denied: No matching workflow details found for this role');
        }

        return {
            permission,
            relevantWorkflowDetails
        };
    }

    async createEntity(data, user,  remarks) {
        const entity = new this.Model({
            ...data,
            status: 'Verification',
            levelId: 1,
            
        });

        await entity.save();

        // Add initial signature
        await addSignatureAndRemarks(
            entity._id,
            user.roleId,
            0,
            remarks ||`${this.entityType} Created`,
            user._id,
            user.userName
        );

        // Create notification
        const { permission } = await this.getWorkflowPermissions(user.roleId);
        const workflowDetail = permission.workflowDetails.find(detail => detail.levelId === 1);

        const notification = await this.createNotification(
            entity._id,
            workflowDetail,
            this.getNotificationMessage(entity, 'created'),
            null
        );

        return { entity, notification };
    }

   
    
        async verifyEntity(entityId, user, remarks) {
            try {
                // First find the entity
                const entity = await this.Model.findById(entityId);
                if (!entity) {
                    throw new Error(`${this.entityType} not found`);
                }
    
                // Get workflow permissions
                const { permission } = await this.getWorkflowPermissions(user.roleId);
    
                // Add signature and remarks
                await addSignatureAndRemarks(
                    entityId,
                    user.roleId,
                    entity.levelId,
                    remarks,
                    user._id,
                    user.userName
                );
    
                // Get next level details
                const nextRoleDetail = permission.workflowDetails.find(
                    detail => detail.levelId === entity.levelId + 1
                );
    
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

    async getEntitiesForVerification(userRoleId) {
        const { relevantWorkflowDetails } = await this.getWorkflowPermissions(userRoleId);

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

        const entities = await this.Model.find({
            _id: { $in: entityIds },
            status: 'Verification',
            levelId: { $in: relevantWorkflowDetails.map(detail => detail.levelId) }
        });

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
    }

    async createNotification(entityId, workflowDetail, message, metadata = null) {
        const notification = new NotificationHub({
            workflowId: this.workflowId,
            roleId: workflowDetail.roleId,
            pathId: workflowDetail.pathId,
            levelId: workflowDetail.levelId,
            relatedEntityId: entityId,
            message,
            status: 'Pending',
            ...(metadata && { metadata })
        });

        await notification.save();

        notificationEmitter.emit('notification', {
            userRoleId: workflowDetail.roleId,
            count: 1
        });

        return notification;
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