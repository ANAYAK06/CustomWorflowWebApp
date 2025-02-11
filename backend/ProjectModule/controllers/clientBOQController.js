
const ClientBOQ = require('../models/clientBOQSchema');
const BOQ = require('../../models/boqModel');
const WorkflowService = require('../../controllers/workflowService');
const fileConfig = require('../../config/fileConfig');
const path = require('path');
const {cleanupFiles} = require('../../config/cleanUpConfig')
const multerConfig = require('../../config/multerConfig');

// Initialize workflow service
const clientBOQWorkflow = new WorkflowService({
    workflowId: 153,
    Model: ClientBOQ,
    entityType: 'Client BOQ',
    getNotificationMessage: (entity, action) => {
        switch(action) {
            case 'created':
                return `New Client BOQ Created for Tender: ${entity.tenderId}`;
            case 'nextLevel':
                return 'Client BOQ moved to next level of verification';
            case 'approved':
                return 'Client BOQ has been approved';
            case 'rejected':
                return 'Client BOQ has been rejected';
            default:
                return `Client BOQ ${action}`;
        }
    }
});

// Create Client BOQ
const createClientBOQ = async (req, res) => {
    let uploadedFiles = null;
    
    try {
        // Handle file upload using multer
        await new Promise((resolve, reject) => {
            multerConfig.upload(req, res, (err) => {
                if (err) {
                    reject(new Error(err.message || 'File upload failed'));
                    return;
                }
                uploadedFiles = req.files;
                resolve();
            });
        });

        const { tenderId, sendToClientDate } = req.body;

        // Validate required fields
        if (!tenderId || !sendToClientDate) {
            await cleanupFiles(req.files);
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: tenderId and sendToClientDate are required'
            });
        }

        // Process attachments if any
        const attachments = [];
        if (req.files && req.files.attachments) {
            for (const file of req.files.attachments) {
                attachments.push({
                    filename: file.originalname,
                    filepath: fileConfig.getRelativePath(fileConfig.BOQ.ATTACHMENTS_DIR, file.filename)
                });
            }
        }

        const boq = await BOQ.findById(tenderId);
        if (!boq) {
            await cleanupFiles(req.files);
            return res.status(404).json({
                success: false,
                message: 'BOQ not found'
            });
        }

        // Create entity through workflow
        const { entity } = await clientBOQWorkflow.createEntity({
            tenderId,
            sendToClientDate: new Date(sendToClientDate),
            attachments,
            status: 'Verification',
            levelId: 1
        }, req.user);

        boq.boqStatus = 'prepareToSubmit';
        await boq.save();

        res.status(201).json({
            success: true,
            message: 'Client BOQ created successfully',
            data: entity
        });

    } catch (error) {
        // Cleanup uploaded files in case of error
        if (uploadedFiles) {
            await cleanupFiles(uploadedFiles);
        }
        
        res.status(500).json({
            success: false,
            message: 'Failed to create Client BOQ',
            error: error.message
        });
    }
};


// Update Client BOQ attachments
const updateAttachments = async (req, res) => {
    try {
        const { id } = req.params;
        
        const clientBOQ = await ClientBOQ.findById(id);
        if (!clientBOQ) {
            await cleanupFiles(req.files);
            return res.status(404).json({
                success: false,
                message: 'Client BOQ not found'
            });
        }

        // Process new attachments
        const newAttachments = [];
        if (req.files && req.files.attachments) {
            for (const file of req.files.attachments) {
                newAttachments.push({
                    filename: file.originalname,
                    filepath: fileConfig.getRelativePath(fileConfig.BOQ.ATTACHMENTS_DIR, file.filename)
                });
            }
        }

        // Update the attachments array
        clientBOQ.attachments = [...clientBOQ.attachments, ...newAttachments];
        await clientBOQ.save();

        res.json({
            success: true,
            message: 'Attachments updated successfully',
            data: clientBOQ
        });

    } catch (error) {
        await cleanupFiles(req.files);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Delete attachment
const deleteAttachment = async (req, res) => {
    try {
        const { id, attachmentId } = req.params;

        const clientBOQ = await ClientBOQ.findById(id);
        if (!clientBOQ) {
            return res.status(404).json({
                success: false,
                message: 'Client BOQ not found'
            });
        }

        // Find the attachment
        const attachmentIndex = clientBOQ.attachments.findIndex(
            att => att._id.toString() === attachmentId
        );

        if (attachmentIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Attachment not found'
            });
        }

        // Get the file path and delete the file
        const filePath = path.join(process.cwd(), clientBOQ.attachments[attachmentIndex].filepath);
        await cleanupFiles({ attachments: [{ path: filePath }] });

        // Remove the attachment from the array
        clientBOQ.attachments.splice(attachmentIndex, 1);
        await clientBOQ.save();

        res.json({
            success: true,
            message: 'Attachment deleted successfully',
            data: clientBOQ
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get Client BOQs for Verification
const getClientBOQsForVerification = async (req, res) => {
    try {
        const userRoleId = parseInt(req.query.userRoleId);
        if (isNaN(userRoleId)) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid userRoleId provided' 
            });
        }

        const result = await clientBOQWorkflow.getEntitiesForVerification(userRoleId);
        
        res.json({
            success: true,
            message: result.message,
            data: result.data
        });

    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
};


// Verify Client BOQ
const verifyClientBOQ = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        console.log('Verification request:', {
            id,
            remarks,
            userRole: req.user.roleId
        });

        // Initial validations
        if (!remarks) {
            return res.status(400).json({
                success: false,
                message: "Remarks are required for verification"
            });
        }

        // Verify the BOQ exists before passing to workflow
        const existingBOQ = await ClientBOQ.findById(id)
            .populate('tenderId')

        if (!existingBOQ) {
            return res.status(404).json({
                success: false,
                message: 'Client BOQ not found'
            });
        }

        // Use workflow service for verification
        const result = await clientBOQWorkflow.verifyEntity(id, req.user, remarks);

        // Handle BOQ-specific logic after successful workflow verification
        if (result.data.status === 'Approved') {
            const boq = await BOQ.findById(existingBOQ.tenderId);
            if (boq) {
                boq.boqStatus = 'submittedToClient';
                await boq.save();
            }
        }

        res.json({
            success: true,
            message: result.message,
            data: result.data
        });

    } catch (error) {
        console.error('Verification controller error:', {
            error: error.message,
            stack: error.stack,
            id: req.params.id
        });

        res.status(500).json({ 
            success: false,
            error: error.message
        });
    }
};
// Reject Client BOQ
const rejectClientBOQ = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        if (!remarks) {
            return res.status(400).json({
                success: false,
                message: "Remarks are required for rejection"
            });
        }
        const clientBOQ = await ClientBOQ.findById(id);
        if (!clientBOQ) {
            return res.status(404).json({
                success: false,
                message: 'Client BOQ not found'
            });
        }
        const boq = await BOQ.findById(clientBOQ.tenderId);
        if (boq) {
            boq.boqStatus = 'Accepted';
            await boq.save();
        }

        const result = await clientBOQWorkflow.rejectEntity(id, req.user, remarks);

        res.json({
            success: true,
            message: 'Client BOQ rejected successfully',
            data: result.data
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get All Accepted Client BOQs
const getAllAcceptedClientBOQs = async (req, res) => {
    try {
        const acceptedBOQs = await ClientBOQ.find({ 
            status: 'Approved'
        }).populate('tenderId', 'tenderNumber tenderName')
          .sort({ createdAt: -1 });

        res.json({
            success: true,
            message: 'Accepted Client BOQs retrieved successfully',
            data: acceptedBOQs
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get Client BOQ by ID
const getClientBOQById = async (req, res) => {
    try {
        const { id } = req.params;

        const clientBOQ = await ClientBOQ.findById(id)
            .populate('tenderId', 'tenderNumber tenderName');

        if (!clientBOQ) {
            return res.status(404).json({
                success: false,
                message: 'Client BOQ not found'
            });
        }

        res.json({
            success: true,
            message: 'Client BOQ retrieved successfully',
            data: clientBOQ
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

module.exports = {
    createClientBOQ,
    getClientBOQsForVerification,
    verifyClientBOQ,
    rejectClientBOQ,
    getAllAcceptedClientBOQs,
    getClientBOQById
};