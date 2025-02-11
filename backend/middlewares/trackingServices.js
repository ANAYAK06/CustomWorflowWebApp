// trackingService.js
const SignatureAndRemarks = require('../models/signatureAndRemarksmodel');
const Permission = require('../models/permissionModel');
const UserRoles = require('../models/userRolesModel');
const Users = require('../models/usersModel');

class TrackingService {
    constructor() {
        this.modelRegistry = new Map();
        this.searchStrategies = new Map();
        this.statusFormatters = new Map();
    }

    /**
     * Register a model with its search strategies and status formatter
     * @param {Object} config Configuration object
     * @param {String} config.documentType Document type identifier
     * @param {Object} config.model Mongoose model
     * @param {Number} config.workflowId Associated workflow ID
     * @param {Object} config.searchStrategies Search strategies for this document type
     * @param {Function} config.statusFormatter Custom status formatting function
     */
    registerDocumentType(config) {
        const { documentType, model, workflowId, searchStrategies, statusFormatter } = config;
        
        this.modelRegistry.set(documentType, {
            model,
            workflowId
        });
        
        this.searchStrategies.set(documentType, searchStrategies);
        this.statusFormatters.set(documentType, statusFormatter);
    }

    /**
     * Get document status based on signatures and related data
     */
    async getDocumentStatus(documentType, searchParams) {
        try {
            // Get registered model and search strategy
            const registration = this.modelRegistry.get(documentType);
            if (!registration) {
                throw new Error(`Unsupported document type: ${documentType}`);
            }

            const { model: Model, workflowId } = registration;
            const strategies = this.searchStrategies.get(documentType);

            // Find the appropriate search strategy
            const strategy = strategies[searchParams.type];
            if (!strategy) {
                throw new Error(`Invalid search type: ${searchParams.type}`);
            }

            // Execute search strategy to find document
            const query = await strategy(searchParams.value);
            const document = await Model.findOne(query).lean();

            if (!document) {
                throw new Error(`Document not found with ${searchParams.type}: ${searchParams.value}`);
            }

            // Get signature history
            const signatureHistory = await SignatureAndRemarks.find({
                relatedEntityId: document._id
            })
            .sort({ createdAt: 1 })
            .populate('userId', 'userName email roleId')
            .lean();

            // Get workflow details
            const workflowDetails = await Permission.findOne({ workflowId })
                .populate('workflowDetails.roleId', 'roleName isCostCentreApplicable')
                .lean();

            // Get all involved users
            const userIds = [...new Set(signatureHistory.map(sig => sig.userId?._id))];
            const users = await Users.find({ _id: { $in: userIds } }).lean();
            const userMap = new Map(users.map(user => [user._id.toString(), user]));

            // Determine current status
            const currentStatus = this.determineCurrentStatus(signatureHistory, workflowDetails);

            // Format response using registered formatter
            const formatter = this.statusFormatters.get(documentType);
            const formattedStatus = formatter({
                document,
                signatureHistory,
                currentStatus,
                workflowDetails,
                userMap
            });

            return {
                success: true,
                data: formattedStatus
            };

        } catch (error) {
            console.error('Error in getDocumentStatus:', error);
            throw error;
        }
    }

    /**
     * Determine current status based on signature history
     */
    determineCurrentStatus(signatureHistory, workflowDetails) {
        if (!signatureHistory.length) {
            const initialLevel = workflowDetails.workflowDetails[0];
            return {
                status: 'Pending',
                levelId: 1,
                roleId: initialLevel?.roleId,
                roleName: initialLevel?.roleName
            };
        }

        const latestSignature = signatureHistory[signatureHistory.length - 1];
        const maxLevel = Math.max(...workflowDetails.workflowDetails.map(d => d.levelId));

        const nextLevel = latestSignature.levelId < maxLevel 
            ? workflowDetails.workflowDetails.find(d => d.levelId === latestSignature.levelId + 1)
            : null;

        return {
            status: latestSignature.levelId === maxLevel ? 'Approved' : 'In Progress',
            levelId: latestSignature.levelId,
            currentRoleId: latestSignature.roleId,
            nextLevelId: nextLevel?.levelId,
            nextRoleId: nextLevel?.roleId,
            nextRoleName: nextLevel?.roleName,
            lastUpdateTime: latestSignature.createdAt
        };
    }

    /**
     * Get comprehensive tracking history
     */
    async getTrackingHistory(documentType, documentId) {
        const registration = this.modelRegistry.get(documentType);
        if (!registration) {
            throw new Error(`Unsupported document type: ${documentType}`);
        }

        const signatureHistory = await SignatureAndRemarks.find({
            relatedEntityId: documentId
        })
        .populate('userId', 'userName email roleId')
        .sort({ createdAt: 1 })
        .lean();

        return signatureHistory.map(signature => ({
            timestamp: signature.createdAt,
            level: signature.levelId,
            role: signature.roleId,
            remarks: signature.remarks,
            user: {
                name: signature.userId?.userName,
                email: signature.userId?.email,
                role: signature.userId?.roleId
            }
        }));
    }
}

// Create instance
const trackingService = new TrackingService();

module.exports = trackingService;