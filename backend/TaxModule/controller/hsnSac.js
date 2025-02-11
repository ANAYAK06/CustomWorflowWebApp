

const HsnSacCode = require('../models/HsnSac');
const Permission = require('../../models/permissionModel');
const NotificationHub = require('../../models/notificationHubModel');
const notificationEmitter = require('../../notificationEmitter');
const { addSignatureAndRemarks, getSignatureandRemakrs } = require('../../controllers/signatureAndRemarks');
const SignatureandRemakrs = require('../../models/signatureAndRemarksmodel')

// Helper function to check if role has already approved
const checkRoleApprovalForHSN = async (hsnId, roleId, levelId) => {
    const hsn = await HsnSacCode.findById(hsnId);
    if (!hsn) {
        throw new Error('HSN code not found');
    }

    const signatures = await SignatureandRemakrs.find({
        entityId: hsnId,
        levelId: levelId,
        roleId: roleId,
        createdAt: { $gt: hsn.updatedAt }
    });

    if (signatures.length > 0) {
        throw new Error('This HSN code has already been processed at your role level');
    }

    return true;
};

// Create new HSN code
const createHSNCode = async (req, res) => {
    try {
        const {
            code,
            type,
            description,
            shortDescription,
            category,
            applicableType,
            taxRateHistory,
            remarks
        } = req.body;

        // Create new HSN code
        const newHSN = new HsnSacCode({
            code,
            type,
            description,
            shortDescription,
            category,
            applicableType,
            taxRateHistory: [{
                effectiveFrom: new Date(),
                ...taxRateHistory
            }],
            status: 'Verification'
        });

        await newHSN.save();

        // Add signature and remarks
        await addSignatureAndRemarks(
            newHSN._id,
            req.user.roleId,
            0,
            remarks || 'HSN Code Created',
            req.user._id,
            req.user.userName
        );

        // Get workflow permission
        const permission = await Permission.findOne({ workflowId: 150 });
        if (!permission) {
            throw new Error('Workflow not found');
        }

        const workflowDetail = permission.workflowDetails.find(detail => detail.levelId === 1);

        // Create notification
        const newNotification = new NotificationHub({
            workflowId: 150,
            roleId: workflowDetail.roleId,
            pathId: workflowDetail.pathId,
            levelId: 1,
            relatedEntityId: newHSN._id,
            message: `New HSN Code ${code} created for verification`,
            status: 'Pending'
        });
        await newNotification.save();

        // Emit notification
        notificationEmitter.emit('notification', {
            userRoleId: workflowDetail.roleId,
            count: 1
        });

        res.status(201).json({
            success: true,
            message: 'HSN Code created successfully',
            hsn: newHSN
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get HSN codes for verification
const getHSNForVerification = async (req, res) => {
    const userRoleId = parseInt(req.query.userRoleId);
    try {
        if (isNaN(userRoleId)) {
            return res.status(400).json({ message: 'Invalid userRoleId provided' });
        }

        const permission = await Permission.findOne({ workflowId: 150 });
        if (!permission) {
            return res.status(404).json({ message: 'HSN workflow not found' });
        }

        const relevantWorkflowDetails = permission.workflowDetails.filter(
            detail => detail.roleId === userRoleId
        );

        if (relevantWorkflowDetails.length === 0) {
            return res.status(403).json({
                message: 'Access denied: No matching workflow details found for this role',
                hsn: []
            });
        }

        const notifications = await NotificationHub.find({
            workflowId: 150,
            roleId: userRoleId,
            status: 'Pending'
        });

        const hsnCodes = await HsnSacCode.find({
            _id: { $in: notifications.map(n => n.relatedEntityId) },
            status: 'Verification'
        });

        const hsnWithSignatures = await Promise.all(hsnCodes.map(async (hsn) => {
            const signatureAndRemarks = await getSignatureandRemakrs(hsn._id);
            return {
                ...hsn.toObject(),
                signatureAndRemarks
            };
        }));

        res.json({
            success: true,
            hsn: hsnWithSignatures
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Verify HSN code
const verifyHSNCode = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;
        const userRoleId = req.user.roleId;

        if (!remarks) {
            return res.status(400).json({
                message: "Remarks are required for verification"
            });
        }

        const hsn = await HsnSacCode.findOne({
            _id: id,
            status: 'Verification'
        });

        if (!hsn) {
            return res.status(404).json({
                message: "HSN code not found for verification"
            });
        }

        // Check if user has already approved
        try {
            await checkRoleApprovalForHSN(id, userRoleId, hsn.levelId);
        } catch (error) {
            return res.status(400).json({
                message: error.message,
                code: 'ALREADY_APPROVED'
            });
        }

        const permission = await Permission.findOne({ workflowId: 150 });
        if (!permission) {
            throw new Error('HSN workflow not found');
        }

        // Add signature and remarks
        await addSignatureAndRemarks(
            id,
            userRoleId,
            hsn.levelId,
            remarks,
            req.user._id,
            req.user.userName
        );

        const nextLevel = permission.workflowDetails.find(
            detail => detail.levelId === hsn.levelId + 1
        );

        if (nextLevel) {
            // Move to next level
            hsn.levelId = nextLevel.levelId;
            await hsn.save();

            // Update notification
            await NotificationHub.findOneAndUpdate(
                {
                    relatedEntityId: id,
                    workflowId: 150,
                    status: 'Pending'
                },
                {
                    levelId: nextLevel.levelId,
                    roleId: nextLevel.roleId,
                    pathId: nextLevel.pathId,
                    message: `HSN Code verification moved to next level`
                }
            );

            notificationEmitter.emit('notification', {
                userRoleId: nextLevel.roleId,
                count: 1
            });
        } else {
            // Final approval
            hsn.status = 'Approved';
            await hsn.save();

            await NotificationHub.findOneAndUpdate(
                {
                    relatedEntityId: id,
                    workflowId: 150,
                    status: 'Pending'
                },
                {
                    status: 'Approved',
                    message: 'HSN Code has been approved'
                }
            );
        }

        const signatureAndRemarks = await getSignatureandRemakrs(id);

        res.json({
            success: true,
            message: nextLevel ? "Moved to next level" : "HSN Code approved",
            hsn: {
                ...hsn.toObject(),
                signatureAndRemarks
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Reject HSN code
const rejectHSNCode = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        if (!remarks) {
            return res.status(400).json({
                message: "Remarks are required for rejection"
            });
        }

        const hsn = await HsnSacCode.findOne({
            _id: id,
            status: 'Verification'
        });

        if (!hsn) {
            return res.status(404).json({
                message: "HSN code not found for verification"
            });
        }

        // Update status
        hsn.status = 'Rejected';
        await hsn.save();

        // Add signature and remarks
        await addSignatureAndRemarks(
            id,
            req.user.roleId,
            hsn.levelId,
            remarks,
            req.user._id,
            req.user.userName
        );

        // Update notification
        await NotificationHub.findOneAndUpdate(
            {
                relatedEntityId: id,
                workflowId: 150,
                status: 'Pending'
            },
            {
                status: 'Rejected',
                message: 'HSN Code has been rejected'
            }
        );

        res.json({
            success: true,
            message: "HSN Code rejected successfully",
            hsn
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get all approved HSN codes
const getAllApprovedHSN = async (req, res) => {
    try {
        const hsnCodes = await HsnSacCode.find({ status: 'Approved' })
            .sort('code');

        res.json({
            success: true,
            hsn: hsnCodes
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Edit HSN code (initiates new workflow)
const editHSNCode = async (req, res) => {
    try {
        const { id } = req.params;
        const { taxRateHistory, remarks, ...updateData } = req.body;

        const hsn = await HsnSacCode.findById(id);
        if (!hsn) {
            return res.status(404).json({
                message: "HSN code not found"
            });
        }

        // Add new tax rate to history if provided
        if (taxRateHistory) {
            hsn.taxRateHistory.push({
                effectiveFrom: new Date(),
                ...taxRateHistory
            });
        }

        // Update other fields and status
        Object.assign(hsn, updateData);
        hsn.status = 'Verification';
        hsn.levelId = 1;

        await hsn.save();

        // Add signature and remarks
        await addSignatureAndRemarks(
            id,
            req.user.roleId,
            0,
            remarks || 'HSN Code Updated',
            req.user._id,
            req.user.userName
        );

        // Create notification for new workflow
        const permission = await Permission.findOne({ workflowId: 151 }); // Separate workflow for edits
        if (!permission) {
            throw new Error('Edit workflow not found');
        }

        const workflowDetail = permission.workflowDetails.find(detail => detail.levelId === 1);

        const newNotification = new NotificationHub({
            workflowId: 151,
            roleId: workflowDetail.roleId,
            pathId: workflowDetail.pathId,
            levelId: 1,
            relatedEntityId: id,
            message: `HSN Code ${hsn.code} updated for verification`,
            status: 'Pending'
        });
        await newNotification.save();

        notificationEmitter.emit('notification', {
            userRoleId: workflowDetail.roleId,
            count: 1
        });

        res.json({
            success: true,
            message: "HSN Code update submitted for verification",
            hsn
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
const getHSNEditsForVerification = async (req, res) => {
    const userRoleId = parseInt(req.query.userRoleId);
    try {
        if (isNaN(userRoleId)) {
            return res.status(400).json({ message: 'Invalid userRoleId provided' });
        }

        const permission = await Permission.findOne({ workflowId: 151 });
        if (!permission) {
            return res.status(404).json({ message: 'HSN edit workflow not found' });
        }

        const relevantWorkflowDetails = permission.workflowDetails.filter(
            detail => detail.roleId === userRoleId
        );

        if (relevantWorkflowDetails.length === 0) {
            return res.status(403).json({
                message: 'Access denied: No matching workflow details found for this role',
                hsn: []
            });
        }

        const notifications = await NotificationHub.find({
            workflowId: 151,
            roleId: userRoleId,
            status: 'Pending'
        });

        const hsnCodes = await HsnSacCode.find({
            _id: { $in: notifications.map(n => n.relatedEntityId) },
            status: 'Verification'
        });

        const hsnWithSignatures = await Promise.all(hsnCodes.map(async (hsn) => {
            const signatureAndRemarks = await getSignatureandRemakrs(hsn._id);
            return {
                ...hsn.toObject(),
                signatureAndRemarks
            };
        }));

        res.json({
            success: true,
            hsn: hsnWithSignatures
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Verify HSN edit
const verifyHSNEdit = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;
        const userRoleId = req.user.roleId;

        if (!remarks) {
            return res.status(400).json({
                message: "Remarks are required for verification"
            });
        }

        const hsn = await HsnSacCode.findOne({
            _id: id,
            status: 'Verification'
        });

        if (!hsn) {
            return res.status(404).json({
                message: "HSN edit not found for verification"
            });
        }

        // Check if user has already approved
        try {
            await checkRoleApprovalForHSN(id, userRoleId, hsn.levelId);
        } catch (error) {
            return res.status(400).json({
                message: error.message,
                code: 'ALREADY_APPROVED'
            });
        }

        const permission = await Permission.findOne({ workflowId: 151 });
        if (!permission) {
            throw new Error('HSN edit workflow not found');
        }

        // Add signature and remarks
        await addSignatureAndRemarks(
            id,
            userRoleId,
            hsn.levelId,
            remarks,
            req.user._id,
            req.user.userName
        );

        const nextLevel = permission.workflowDetails.find(
            detail => detail.levelId === hsn.levelId + 1
        );

        if (nextLevel) {
            // Move to next level
            hsn.levelId = nextLevel.levelId;
            await hsn.save();

            // Update notification
            await NotificationHub.findOneAndUpdate(
                {
                    relatedEntityId: id,
                    workflowId: 151,
                    status: 'Pending'
                },
                {
                    levelId: nextLevel.levelId,
                    roleId: nextLevel.roleId,
                    pathId: nextLevel.pathId,
                    message: `HSN Code edit verification moved to next level`
                }
            );

            notificationEmitter.emit('notification', {
                userRoleId: nextLevel.roleId,
                count: 1
            });
        } else {
            // Final approval
            hsn.status = 'Approved';
            await hsn.save();

            await NotificationHub.findOneAndUpdate(
                {
                    relatedEntityId: id,
                    workflowId: 151,
                    status: 'Pending'
                },
                {
                    status: 'Approved',
                    message: 'HSN Code edit has been approved'
                }
            );
        }

        const signatureAndRemarks = await getSignatureandRemakrs(id);

        res.json({
            success: true,
            message: nextLevel ? "Moved to next level" : "HSN Code edit approved",
            hsn: {
                ...hsn.toObject(),
                signatureAndRemarks
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Reject HSN edit
const rejectHSNEdit = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        if (!remarks) {
            return res.status(400).json({
                message: "Remarks are required for rejection"
            });
        }

        const hsn = await HsnSacCode.findOne({
            _id: id,
            status: 'Verification'
        });

        if (!hsn) {
            return res.status(404).json({
                message: "HSN edit not found for verification"
            });
        }

        // If this is a tax rate change, remove the latest tax rate entry
        if (hsn.taxRateHistory.length > 1) {
            hsn.taxRateHistory.pop(); // Remove the latest entry
        }

        hsn.status = 'Rejected';
        await hsn.save();

        // Add signature and remarks
        await addSignatureAndRemarks(
            id,
            req.user.roleId,
            hsn.levelId,
            remarks,
            req.user._id,
            req.user.userName
        );

        // Update notification
        await NotificationHub.findOneAndUpdate(
            {
                relatedEntityId: id,
                workflowId: 151,
                status: 'Pending'
            },
            {
                status: 'Rejected',
                message: 'HSN Code edit has been rejected'
            }
        );

        res.json({
            success: true,
            message: "HSN Code edit rejected successfully",
            hsn
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

module.exports = {
    createHSNCode,
    getHSNForVerification,
    verifyHSNCode,
    rejectHSNCode,
    getAllApprovedHSN,
    editHSNCode,
    getHSNEditsForVerification,
    verifyHSNEdit,
    rejectHSNEdit
};