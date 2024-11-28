const mongoose = require('mongoose');
const BusinessOpportunity = require('../../models/businessOpportunityModel');
const Permission = require('../../models/permissionModel');
const notificationEmitter = require('../../notificationEmitter');
const NotificationHub = require('../../models/notificationHubModel');
const { addSignatureAndRemarks, getSignatureandRemakrs } = require('../../controllers/signatureAndRemarks');

const createBusinessOpportunity = async (req, res) => {
    try {
        const {
            type,
            descriptionOfWork,
            submissionDate,
            client,
            ultimateCustomer,
            opportunityType,
            businessCategory,
            estimatedValue,
            tenderDetails,
            jointVentureAcceptable,
            jointVentureDetails,
            remarks
        } = req.body;

        // Validate required fields
        if (!type || !descriptionOfWork || !submissionDate || !client || !opportunityType || !businessCategory) {
            return res.status(400).json({
                message: "Required fields missing"
            });
        }

        // Additional validation for TENDER type
        if (type === 'TENDER') {
            if (!ultimateCustomer || !tenderDetails) {
                return res.status(400).json({
                    message: "Ultimate customer and tender details are required for tender type opportunities"
                });
            }
        }

        // Prepare opportunity data
        let opportunityData = {
            type,
            descriptionOfWork,
            submissionDate: new Date(submissionDate),
            client,
            opportunityType,
            businessCategory,
            estimatedValue,
            status: 'Verification',
            levelId: 1,
            jointVentureAcceptable
        };

        // Add tender-specific data if type is TENDER
        if (type === 'TENDER') {
            opportunityData.ultimateCustomer = ultimateCustomer;
            opportunityData.tenderDetails = tenderDetails;
        }

        // Add joint venture details only if acceptable and details are provided
        if (jointVentureAcceptable && jointVentureDetails) {
            opportunityData.jointVentureDetails = jointVentureDetails;
        }

        // Generate opportunity number
        const currentYear = new Date().getFullYear();
        const lastOpportunity = await BusinessOpportunity.findOne({
            opportunityNumber: new RegExp(`EPPL/${currentYear}/`)
        }).sort({ opportunityNumber: -1 });

        let nextSerial = '0001';
        if (lastOpportunity) {
            const lastSerial = lastOpportunity.opportunityNumber.split('/')[2];
            nextSerial = (parseInt(lastSerial) + 1).toString().padStart(4, '0');
        }

        opportunityData.opportunityNumber = `EPPL/${currentYear}/${nextSerial}`;

        // Create and save the new opportunity
        const newOpportunity = new BusinessOpportunity(opportunityData);
        await newOpportunity.save();

        // Add signature and remarks
        await addSignatureAndRemarks(
            newOpportunity._id,
            req.user.roleId,
            0,
            remarks,
            req.user._id,
            req.user.userName
        );

        // Get workflow permission (workflowId: 145 for Business Opportunities)
        const permission = await Permission.findOne({ workflowId: 145 });
        if (!permission) {
            return res.status(404).json({ message: "Workflow not found" });
        }

        const workflowDetail = permission.workflowDetails.find(detail => detail.levelId === 1);
        if (!workflowDetail) {
            return res.status(404).json({ message: 'Workflow detail not found' });
        }

        // Create notification
        const newNotification = new NotificationHub({
            workflowId: 145,
            roleId: workflowDetail.roleId,
            pathId: workflowDetail.pathId,
            levelId: 1,
            relatedEntityId: newOpportunity._id,
            message: `New Business Opportunity Created: ${opportunityData.opportunityNumber} - ${client.name}`,
            status: 'Pending'
        });
        await newNotification.save();

        // Emit notification
        notificationEmitter.emit('notification', {
            userRoleId: workflowDetail.roleId,
            count: 1
        });

        res.status(201).json({
            message: 'Business opportunity created successfully and sent for verification',
            opportunity: newOpportunity,
            notification: newNotification
        });

    } catch (error) {
        console.error('Business Opportunity Creation Error:', error);
        
        // Handle specific MongoDB validation errors
        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                message: 'Validation error',
                errors: validationErrors
            });
        }

        // Handle unique constraint violations
        if (error.code === 11000) {
            return res.status(400).json({
                message: 'Duplicate opportunity number',
                error: 'An opportunity with this number already exists'
            });
        }

        // Handle other errors
        res.status(500).json({
            message: 'An error occurred while creating the business opportunity',
            error: error.message
        });
    }
};
/**
 * Get opportunities for verification
 */
const getOpportunitiesForVerification = async (req, res) => {
    const userRoleId = parseInt(req.query.userRoleId);
    try {
        if (isNaN(userRoleId)) {
            return res.status(400).json({ message: 'Invalid userRoleId provided' });
        }

        // Verify workflow and permissions
        const permission = await Permission.findOne({ workflowId: 145 });
        if (!permission) {
            return res.status(404).json({ message: 'Workflow not found' });
        }

        const relevantWorkflowDetails = permission.workflowDetails.filter(
            detail => detail.roleId === userRoleId
        );

        if (relevantWorkflowDetails.length === 0) {
            return res.status(403).json({
                message: 'Access denied: No matching workflow details found for this role',
                opportunities: []
            });
        }

        // Get relevant notifications
        const notifications = await NotificationHub.find({
            workflowId: 145,
            roleId: userRoleId,
            pathId: { $in: relevantWorkflowDetails.map(detail => detail.pathId) },
            status: 'Pending'
        });

        if (!notifications.length) {
            return res.status(200).json({
                message: 'No pending items for verification',
                opportunities: []
            });
        }

        const opportunityIds = notifications.map(notification => notification.relatedEntityId);

        // Get opportunities with pending verification
        const opportunities = await BusinessOpportunity.find({
            _id: { $in: opportunityIds },
            status: 'Verification',
            levelId: { $in: relevantWorkflowDetails.map(detail => detail.levelId) }
        });

        // Get signatures and remarks for each opportunity
        const opportunitiesWithSignatures = await Promise.all(opportunities.map(async (opportunity) => {
            const signatureAndRemarks = await getSignatureandRemakrs(opportunity._id);
            return {
                ...opportunity.toObject(),
                signatureAndRemarks
            };
        }));

        res.status(200).json({
            success: true,
            message: 'Business opportunities retrieved successfully',
            opportunities: opportunitiesWithSignatures
        });

    } catch (error) {
        console.error('Error fetching opportunities for verification:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error', 
            error: error.message 
        });
    }
};

/**
 * Update business opportunity status (approve/move to next level)
 */
const updateBusinessOpportunity = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        if (!remarks) {
            return res.status(400).json({
                message: "Remarks are required for verification"
            });
        }

        const opportunity = await BusinessOpportunity.findById(id);
        if (!opportunity) {
            return res.status(404).json({ 
                message: "No business opportunity found for verification" 
            });
        }

        const { levelId } = opportunity;
        const permission = await Permission.findOne({ workflowId: 145 });
        if (!permission) {
            return res.status(403).json({ message: 'Permission not found' });
        }

        // Add signature and remarks
        await addSignatureAndRemarks(
            id, 
            req.user.roleId, 
            levelId, 
            remarks, 
            req.user._id, 
            req.user.userName
        );

        const nextRoleDetail = permission.workflowDetails.find(
            detail => detail.levelId === levelId + 1
        );

        if (nextRoleDetail) {
            // Move to next level
            const updatedOpportunity = await BusinessOpportunity.findByIdAndUpdate(
                id,
                { 
                    levelId: nextRoleDetail.levelId,
                    updatedBy: req.user._id 
                },
                { new: true }
            );

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

            return res.status(200).json({
                success: true,
                message: "Business opportunity updated to next level",
                opportunity: updatedOpportunity
            });
        } else {
            // Final approval
            const updatedOpportunity = await BusinessOpportunity.findByIdAndUpdate(
                id,
                { 
                    status: 'Approved',
                    requestStatus: 'Accepted',
                    updatedBy: req.user._id 
                },
                { new: true }
            );

            // Update notification status
            await NotificationHub.findOneAndUpdate(
                { relatedEntityId: id },
                { status: 'Approved' }
            );

            return res.status(200).json({
                success: true,
                message: "Business opportunity approved successfully",
                opportunity: updatedOpportunity
            });
        }

    } catch (error) {
        console.error('Business opportunity update error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while updating the business opportunity',
            error: error.message
        });
    }
};

/**
 * Reject business opportunity
 */
const rejectBusinessOpportunity = async (req, res) => {
    try {
        const { id, remarks } = req.body;

        if (!remarks) {
            return res.status(400).json({
                message: "Remarks are required for rejection"
            });
        }

        const opportunity = await BusinessOpportunity.findOne({ 
            _id: id, 
            status: 'Verification' 
        });

        if (!opportunity) {
            return res.status(404).json({ 
                message: 'No business opportunity found for verification' 
            });
        }

        const { _id, levelId } = opportunity;

        // Update opportunity status
        opportunity.status = 'Rejected';
        opportunity.requestStatus = 'Rejected';
        opportunity.updatedBy = req.user._id;
        await opportunity.save();

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

        return res.status(200).json({ 
            success: true,
            message: 'Business opportunity rejected successfully' 
        });
    } catch (error) {
        console.error('Error rejecting business opportunity:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error', 
            error: error.message 
        });
    }
};

/**
 * Get all approved business opportunities
 */
const getAllOpportunities = async (req, res) => {
    try {
        const opportunities = await BusinessOpportunity.find({ status: 'Approved' })
            .select('type client opportunityType businessCategory estimatedValue')
            .lean();

        res.status(200).json({
            success: true,
            opportunities
        });
    } catch (error) {
        console.error('Error fetching business opportunities:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching business opportunities',
            error: error.message
        });
    }
};

const getApprovedAcceptedOpportunities = async (req, res) => {
    try {
        const opportunities = await BusinessOpportunity.find({
            status: 'Approved',
            requestStatus: 'Accepted'
        })
        .select('opportunityNumber type descriptionOfWork client ultimateCustomer opportunityType businessCategory estimatedValue submissionDate requestStatus tenderDetails')
        .sort({ createdAt: -1 })  // Newest first
        .lean();

        res.status(200).json({
            success: true,
            message: 'Approved and accepted opportunities retrieved successfully',
            opportunities
        });
    } catch (error) {
        console.error('Error fetching approved and accepted opportunities:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching opportunities',
            error: error.message
        });
    }
};

module.exports = {
    createBusinessOpportunity,
    updateBusinessOpportunity,
    getOpportunitiesForVerification,
    rejectBusinessOpportunity,
    getAllOpportunities,
    getApprovedAcceptedOpportunities
};