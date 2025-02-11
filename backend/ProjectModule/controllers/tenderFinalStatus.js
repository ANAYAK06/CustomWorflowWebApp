const TenderFinalStatus = require('../models/tenderFinalStatusModel');
const BOQ = require('../../models/boqModel');
const WorkflowService = require('../../controllers/workflowService');
const fileConfig = require('../../config/fileConfig');
const { cleanupFiles } = require('../../config/cleanUpConfig');
const multerConfig = require('../../config/multerConfig');

// Initialize workflow service
const tenderFinalStatusWorkflow = new WorkflowService({
    workflowId: 148,
    Model: TenderFinalStatus,
    entityType: 'Tender Final Status',
    getNotificationMessage: (entity, action) => {
        switch(action) {
            case 'created':
                return `New tender final status update for BOQ #${entity.boq?.offerNumber}`;
            case 'nextLevel':
                return 'Tender status moved to next level of verification';
            case 'approved':
                return 'Tender status has been approved';
            case 'rejected':
                return 'Tender status has been rejected';
            default:
                return `Tender status ${action}`;
        }
    }
});

// Get BOQs ready for final status
const getTenderForFinalStatus = async (req, res) => {
    try {
        const boqs = await BOQ.find({ 
            boqStatus: 'submittedToClient' 
        }).populate({
            path: 'businessOpportunity',
            populate: {
                path: 'client'
            }
        });

        res.json({
            success: true,
            data: boqs
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Create tender final status
const createTenderFinalStatus = async (req, res) => {
    let uploadedFiles = null;

    try {
        // Handle file upload if there are attachments
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

        const { boqId, tenderStatus, remarks } = req.body;
        let wonDetails = null;
        let lostDetails = null;

        // Parse JSON strings from form data
        if (tenderStatus === 'won') {
            wonDetails = JSON.parse(req.body.wonDetails);
        } else {
            lostDetails = JSON.parse(req.body.lostDetails);
        }

        // Validate BOQ exists and populate necessary fields
        const boq = await BOQ.findById(boqId).populate('businessOpportunity');
        if (!boq) {
            await cleanupFiles(req.files);
            return res.status(404).json({
                success: false,
                message: 'BOQ not found'
            });
        }

        // Process attachments if any
        const attachments = [];
        if (req.files && req.files.attachments) {
            for (const file of req.files.attachments) {
                attachments.push({
                    name: file.originalname,
                    path: fileConfig.getRelativePath(fileConfig.TENDER.ATTACHMENTS_DIR, file.filename),
                    uploadedAt: new Date()
                });
            }
        }

        // Prepare entity data based on tender status
        let entityData = {
            boq: boqId,
            tenderStatus,
            attachments,
            remarks
        };

        if (tenderStatus === 'won') {
            // Validate required fields for won tender
            if (!wonDetails.workLocation || !wonDetails.expectedStartDate) {
                throw new Error('Required fields missing for won tender');
            }

            // Get tender number from BOQ if not provided
            const tenderNumber = wonDetails.tenderNumber || 
                               boq.businessOpportunity?.tenderDetails?.tenderNumber ||
                               boq.offerNumber; // fallback to offer number if no tender number

            entityData.wonDetails = {
                tenderNumber,
                poNumber: wonDetails.poNumber || undefined,
                clientPODate: wonDetails.clientPODate ? new Date(wonDetails.clientPODate) : undefined,
                workLocation: wonDetails.workLocation,
                expectedStartDate: new Date(wonDetails.expectedStartDate),
                originalBOQAmount: Number(wonDetails.originalBOQAmount),
                negotiatedAmount: Number(wonDetails.negotiatedAmount),
                originalVariationPercentage: Number(wonDetails.originalVariationPercentage),
                finalVariationPercentage: Number(wonDetails.finalVariationPercentage),
                finalVariationAmount: Number(wonDetails.finalVariationAmount),
                finalAcceptedAmount: Number(wonDetails.finalAcceptedAmount)
            };
        } else if (tenderStatus === 'lost') {
            // Validate required fields for lost tender
            if (!lostDetails.L1?.companyName || !lostDetails.reasonForLoss || !lostDetails.futurePrecautions) {
                throw new Error('Required fields missing for lost tender');
            }

            entityData.lostDetails = {
                L1: {
                    companyName: lostDetails.L1.companyName,
                    price: Number(lostDetails.L1.price),
                    difference: lostDetails.L1.price ? Number(lostDetails.L1.price) - boq.totalAmount : undefined
                },
                L2: {
                    companyName: lostDetails.L2?.companyName,
                    price: lostDetails.L2?.price ? Number(lostDetails.L2.price) : undefined,
                    difference: lostDetails.L2?.price ? Number(lostDetails.L2.price) - boq.totalAmount : undefined
                },
                winningParty: lostDetails.winningParty,
                reasonForLoss: lostDetails.reasonForLoss,
                futurePrecautions: lostDetails.futurePrecautions
            };
        }

        // Create entity through workflow
        const result = await tenderFinalStatusWorkflow.createEntity(entityData, req.user, remarks);

        // Update BOQ status
        boq.boqStatus = tenderStatus;
        await boq.save();

        res.status(201).json({
            success: true,
            message: 'Tender final status created successfully',
            data: result.entity
        });

    } catch (error) {
        // Cleanup uploaded files in case of error
        if (uploadedFiles) {
            await cleanupFiles(uploadedFiles);
        }

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Get tender status for verification
const getTenderStatusForVerification = async (req, res) => {
    try {
        const userRoleId = parseInt(req.query.userRoleId);
        if (isNaN(userRoleId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid userRoleId provided'
            });
        }

        const result = await tenderFinalStatusWorkflow.getEntitiesForVerification(userRoleId);

        // Populate complete BOQ details
        const populatedData = await TenderFinalStatus.populate(result.data, [
            {
                path: 'boq',
                populate: {
                    path: 'businessOpportunity',
                    populate: {
                        path: 'client'
                    }
                }
            }
        ]);

        res.json({
            success: true,
            data: populatedData
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Update tender status
const updateTenderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        if (!remarks) {
            return res.status(400).json({
                success: false,
                message: "Remarks are required for verification"
            });
        }

        // Verify the tender status exists
        const existingStatus = await TenderFinalStatus.findById(id)
            .populate('boq');

        if (!existingStatus) {
            return res.status(404).json({
                success: false,
                message: 'Tender status not found'
            });
        }

        // Use workflow service for verification
        const result = await tenderFinalStatusWorkflow.verifyEntity(id, req.user, remarks);

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

// Reject tender status
const rejectTenderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        if (!remarks) {
            return res.status(400).json({
                success: false,
                message: "Remarks are required for rejection"
            });
        }

        const tenderStatus = await TenderFinalStatus.findById(id);
        if (!tenderStatus) {
            return res.status(404).json({
                success: false,
                message: 'Tender status not found'
            });
        }

        // Update the related BOQ status back to 'submittedToClient'
        await BOQ.findByIdAndUpdate(
            tenderStatus.boq,
            { boqStatus: 'submittedToClient' }
        );

        // Use workflow service for rejection
        const result = await tenderFinalStatusWorkflow.rejectEntity(id, req.user, remarks);

        res.json({
            success: true,
            message: 'Tender status rejected successfully',
            data: result.data
        });

    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
};

module.exports = {
    getTenderForFinalStatus,
    createTenderFinalStatus,
    getTenderStatusForVerification,
    updateTenderStatus,
    rejectTenderStatus
};