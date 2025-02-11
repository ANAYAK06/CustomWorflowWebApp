const fileConfig = require('../../config/fileConfig');
const BOQ = require('../../models/boqModel');
const BusinessOpportunity = require('../../models/businessOpportunityModel');
const Permission = require('../../models/permissionModel');
const NotificationHub = require('../../models/notificationHubModel');
const notificationEmitter = require('../../notificationEmitter');
const { addSignatureAndRemarks, getSignatureandRemakrs } = require('../../controllers/signatureAndRemarks');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const multerConfig = require('../../config/multerConfig');
const SignatureandRemakrs = require('../../models/signatureAndRemarksmodel')




const checkRoleApproval = async (boqId, roleId, levelId) => {
    const boq = await BOQ.findById(boqId);
    if (!boq) {
        throw new Error('BOQ not found');
    }

    // Get all signatures for this BOQ at current level
    const signatures = await SignatureandRemakrs.find({
        entityId: boqId,
        levelId: levelId,
        roleId: roleId
    });

    if (signatures.length > 0) {
        throw new Error('This BOQ has already been processed at your role level');
    }

    return true;
};
/**
 * Safely validates and processes Excel data
 */
const validateExcelStructure = (data) => {
    const requiredColumns = [
        'Sl No', 'Description', 'Unit', 'Quantity', ,
        'Unit Rate', 'Minimum Rate', 'Amount'
    ];

    const firstRow = data[0];
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));

    if (missingColumns.length > 0) {
        throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
    }

    return true;
};

/**
 * Process Excel file and return structured data
 */
const processExcelData = async (filePath) => {
    try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet);

        validateExcelStructure(data);

        return data.map(row => ({
            slNo: row['Sl No'].toString(),
            description: row['Description'],
            unit: row['Unit'],
            qty: parseFloat(row['Quantity']),
            unitRate: parseFloat(row['Unit Rate']),
            minimumRate: parseFloat(row['Minimum Rate']),
            amount: parseFloat(row['Amount']),
            remarks: row['Remarks'] || '',
            attachmentRequired: row['Attachment Required']?.toLowerCase() === 'yes'
        }));
    } catch (error) {
        console.error('Excel Processing Error:', error);
        throw new Error(`Excel processing failed: ${error.message}`);
    }
};

/**
 * Clean up uploaded files in case of error
 */
const cleanupFiles = async (files, isError = true) => {
    if (!files || !isError) return;

    try {
        const filesToDelete = [];

        // Collect all files that need to be deleted
        if (files.excelFile?.[0]) {
            filesToDelete.push(files.excelFile[0].path);
        }

        if (files.attachments) {
            files.attachments.forEach(file => filesToDelete.push(file.path));
        }

        if (files.itemAttachments) {
            files.itemAttachments.forEach(file => filesToDelete.push(file.path));
        }

        // Delete files
        await Promise.all(
            filesToDelete.map(async (filePath) => {
                try {
                    await fsPromises.unlink(filePath);
                    console.log(`Deleted file: ${filePath}`);
                } catch (error) {
                    console.error(`Error deleting file ${filePath}:`, error);
                }
            })
        );
    } catch (error) {
        console.error('Error in cleanupFiles:', error);
    }
};

/**
 * Main BOQ creation controller
 */
const createBOQ = async (req, res) => {
    let uploadedFiles = null;
    let savedBOQ = null;

    try {
        // Handle file upload
        await new Promise((resolve, reject) => {
            multerConfig.upload(req, res, (err) => {
                if (err) {
                    console.error('Upload error:', err);
                    reject(new Error(err.message || 'File upload failed'));
                    return;
                }
                uploadedFiles = req.files;
                resolve();
            });
        });

        console.log('Files received:', {
            excel: req.files.excelFile?.length || 0,
            itemAttachments: req.files.itemAttachments?.length || 0,
            attachments: req.files.attachments?.length || 0
        });

        // Validate required files
        if (!req.files?.excelFile?.[0]) {
            throw new Error('Excel file is required');
        }

        const { businessOpportunityId, remarks } = req.body;

        // Validate business opportunity
        const businessOpp = await BusinessOpportunity.findById(businessOpportunityId);
        if (!businessOpp) {
            throw new Error('Business opportunity not found');
        }

        // Process Excel data
        console.log('Processing Excel file:', req.files.excelFile[0].path);
        const excelData = await processExcelData(req.files.excelFile[0].path);

        // Process checklist data
        let checklistData = [];
        if (req.body.checklist) {
            try {
                checklistData = JSON.parse(req.body.checklist);
            } catch (error) {
                throw new Error('Invalid checklist data format');
            }
        }
         // Create a map of item attachments using Sl No as the key
         const itemAttachmentsMap = new Map();
         if (req.files.itemAttachments && req.body.items) {
             const itemsMetadata = JSON.parse(req.body.items);
             
             itemsMetadata.forEach(item => {
                 if (item.attachment) {
                     const matchingFile = req.files.itemAttachments.find(
                         file => file.originalname === item.attachment.fileName
                     );
                     
                     if (matchingFile) {
                         // Convert slNo to string explicitly since that's how it's stored in items
                         const slNo = item.slNo.toString();
                         console.log('Adding to map with key:', slNo, 'type:', typeof slNo);
                         itemAttachmentsMap.set(slNo, {
                             fileName: matchingFile.filename,
                             filePath: fileConfig.getRelativePath(fileConfig.BOQ.ITEM_ATTACHMENTS_DIR, matchingFile.filename),
                             uploadedAt: new Date()
                         });
                     }
                 }
             });
         }
 
        

         const processedItems = excelData.map(item => {
            // Debug log to check the type of slNo
            console.log('Processing item slNo:', item.slNo, 'type:', typeof item.slNo);
            
            const baseItem = {
                slNo: item.slNo.toString(), // Ensure it's stored as string
                description: item.description,
                unit: item.unit,
                qty: item.qty,
                unitRate: item.unitRate,
                minimumRate: item.minimumRate,
                amount: item.amount,
                remarks: item.remarks || '',
                attachmentRequired: item.attachmentRequired,
            };
        
            // Debug the map check
            const itemSlNo = item.slNo.toString();
            console.log('Checking map for slNo:', itemSlNo, {
                mapHasKey: itemAttachmentsMap.has(itemSlNo),
                attachmentRequired: item.attachmentRequired,
                availableKeys: Array.from(itemAttachmentsMap.keys())
            });
        
            if (item.attachmentRequired && itemAttachmentsMap.has(itemSlNo)) {
                console.log('Found attachment for item:', itemSlNo);
                baseItem.attachment = itemAttachmentsMap.get(itemSlNo);
            }
        
            return baseItem;
        });

        // Process supporting documents
        const attachments = [];
        if (req.files.attachments) {
            console.log('Processing supporting documents...');
            
            try {
                // Parse the metadata
                const metadata = JSON.parse(req.body.attachmentMetadata);
                console.log('Attachment metadata:', metadata);
        
                // Process each attachment with its metadata
                req.files.attachments.forEach((file, index) => {
                    // Find corresponding metadata
                    const fileMetadata = metadata[index];
                    
                    if (fileMetadata) {
                        attachments.push({
                            name: fileMetadata.name, // This is the user-entered name from the dialog
                            filePath: fileConfig.getRelativePath(fileConfig.BOQ.ATTACHMENTS_DIR, file.filename),
                            fileType: file.mimetype,
                            uploadedBy: req.user._id,
                            uploadedAt: new Date()
                        });
                    }
                });
        
            } catch (error) {
                console.error('Error processing attachment metadata:', error);
                // Fallback to using original filenames if metadata parsing fails
                req.files.attachments.forEach(file => {
                    attachments.push({
                        name: file.originalname,
                        filePath: fileConfig.getRelativePath(fileConfig.BOQ.ATTACHMENTS_DIR, file.filename),
                        fileType: file.mimetype,
                        uploadedBy: req.user._id,
                        uploadedAt: new Date()
                    });
                });
            }
    }
        

        // Calculate total amount
        const totalAmount = processedItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

        // Create BOQ object
        const boqData = {
            businessOpportunity: businessOpportunityId,
            items: processedItems,
            totalAmount,
            originalAmount:totalAmount,
            attachments,
            checklist: checklistData,
            status: 'Verification',
            variationAcceptance: req.body.variationAcceptance || 0,
            levelId: 1,
            createdBy: req.user._id,
            boqStatus: 'Submitted',
            excelFilePath: fileConfig.getRelativePath(
                fileConfig.BOQ.EXCEL_DIR,
                req.files.excelFile[0].filename
            )
        };

        // Save BOQ
        console.log('Saving BOQ data...');
        const boq = new BOQ(boqData);
        savedBOQ = await boq.save();

        try {
            console.log('Updating Business Opportunity status for ID:', businessOpportunityId);
            
            const updatedBO = await BusinessOpportunity.findByIdAndUpdate(
                businessOpportunityId,
                { 
                    requestStatus: 'BOQDrafted',
                    updatedBy: req.user._id,
                    updatedAt: new Date()
                },
                { new: true } // This option returns the updated document
            );
        
            if (!updatedBO) {
                console.error('Business Opportunity not found during status update');
                throw new Error('Failed to update Business Opportunity status');
            }
        
            console.log('Business Opportunity status updated successfully:', updatedBO.requestStatus);
        } catch (error) {
            console.error('Error updating Business Opportunity status:', error);
            // You might want to decide whether to throw this error or just log it
            // If you throw it, it will trigger the catch block and cleanup
            throw new Error(`Failed to update Business Opportunity status: ${error.message}`);
        }


        // Add signature and remarks
        await addSignatureAndRemarks(
            savedBOQ._id,
            req.user.roleId,
            0,
            remarks || 'BOQ Created',
            req.user._id,
            req.user.userName
        );

        // Create notification
        const permission = await Permission.findOne({ workflowId: 146 });
        if (!permission) {
            throw new Error('Workflow not found');
        }

        const workflowDetail = permission.workflowDetails.find(detail => detail.levelId === 1);
        if (!workflowDetail) {
            throw new Error('Workflow detail not found');
        }

        console.log('Processed Items Summary:', processedItems.map(item => ({
            slNo: item.slNo,
            hasAttachment: !!item.attachment,
            attachmentRequired: item.attachmentRequired
        })));

        // Create and save notification
        const newNotification = new NotificationHub({
            workflowId: 146,
            roleId: workflowDetail.roleId,
            pathId: workflowDetail.pathId,
            levelId: 1,
            relatedEntityId: savedBOQ._id,
            message: `New BOQ Created for ${businessOpp.client.name}`,
            status: 'Pending'
        });
        await newNotification.save();

        // Emit notification
        notificationEmitter.emit('notification', {
            userRoleId: workflowDetail.roleId,
            count: 1
        });

        // Send success response
        res.status(201).json({
            message: 'BOQ created successfully',
            boq: savedBOQ,
            notification: newNotification
        });

    } catch (error) {
        console.error('Error in createBOQ:', error);
        
        // Clean up files only if BOQ wasn't saved
        if (!savedBOQ && uploadedFiles) {
            console.log('Cleaning up uploaded files due to error...');
            await cleanupFiles(uploadedFiles, true);
        }
        
        res.status(500).json({
            error: error.message,
            message: 'Failed to create BOQ'
        });
    }
};


const getBOQsForVerification = async (req, res) => {
    const userRoleId = parseInt(req.query.userRoleId);
    try {
        if (isNaN(userRoleId)) {
            return res.status(400).json({ message: 'Invalid userRoleId provided' });
        }

        const permission = await Permission.findOne({ workflowId: 146 });
        if (!permission) {
            return res.status(404).json({ message: 'Workflow not found' });
        }

        const relevantWorkflowDetails = permission.workflowDetails.filter(
            detail => detail.roleId === userRoleId
        );

        if (relevantWorkflowDetails.length === 0) {
            return res.status(403).json({
                message: 'Access denied: No matching workflow details found for this role',
                boqs: []
            });
        }

        const notifications = await NotificationHub.find({
            workflowId: 146,
            roleId: userRoleId,
            pathId: { $in: relevantWorkflowDetails.map(detail => detail.pathId) },
            status: 'Pending'
        });

        if (!notifications.length) {
            return res.status(200).json({
                message: 'No pending items for verification',
                boqs: []
            });
        }

        const boqIds = notifications.map(notification => notification.relatedEntityId);

        const boqs = await BOQ.find({
            _id: { $in: boqIds },
            status: 'Verification',
            levelId: { $in: relevantWorkflowDetails.map(detail => detail.levelId) }
        }).populate('businessOpportunity');

        const boqsWithSignatures = await Promise.all(boqs.map(async (boq) => {
            const signatureAndRemarks = await getSignatureandRemakrs(boq._id);
            return {
                ...boq.toObject(),
                signatureAndRemarks
            };
        }));

        res.json({
            success: true,
            message: 'BOQs retrieved successfully',
            boqs: boqsWithSignatures
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
const updateBOQ = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks, items, totalAmount } = req.body;
        const userRoleId = req.user.roleId;

        console.log('Received update data:', { 
            remarks, 
            items: items?.length, 
            totalAmount 
        });

        if (!remarks) {
            return res.status(400).json({
                message: "Remarks are required for verification"
            });
        }

        const boq = await BOQ.findById(id);
        if (!boq) {
            return res.status(404).json({
                message: "No BOQ found for verification"
            });
        }

        const { levelId } = boq;

        try {
            await checkRoleApproval(id, userRoleId, levelId);
        } catch (error) {
            return res.status(400).json({
                message: error.message,
                code: 'ALREADY_APPROVED'
            });
        }

        const permission = await Permission.findOne({ workflowId: 146 });
        if (!permission) {
            throw new Error('Permission not found');
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

        // Update items if provided
        if (items && Array.isArray(items)) {
            // Validate the updated items

            console.log('Updating BOQ items:', items);

            const isValidUpdate = items.every(item => (
                item._id && 
                typeof item.unitRate === 'number' && 
                typeof item.amount === 'number' &&
                item.unitRate >= 0 &&
                item.amount >= 0
            ));

            if (!isValidUpdate) {
                return res.status(400).json({
                    message: "Invalid item data provided for update"
                });
            }

            boq.items = boq.items.map(existingItem => {
                const updatedItem = items.find(item => item._id.toString() === existingItem._id.toString());
                if (updatedItem) {
                    return {
                        ...existingItem,
                        unitRate: updatedItem.unitRate,
                        amount: updatedItem.amount
                    };
                }
                return existingItem;
            });

            // Update total amount
            if (typeof totalAmount === 'number' && totalAmount >= 0) {
                boq.totalAmount = totalAmount;
            } else {
                // Recalculate total if not provided
                boq.totalAmount = boq.items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
            }
        }

        // Get next workflow level details
        const nextRoleDetail = permission.workflowDetails.find(
            detail => detail.levelId === levelId + 1
        );

        if (nextRoleDetail) {
            // Move to next level
            boq.levelId = nextRoleDetail.levelId;
            boq.updatedBy = req.user._id;
            await boq.save();

            // Update notification
            await NotificationHub.findOneAndUpdate(
                { 
                    relatedEntityId: id,
                    status: 'Pending'
                },
                {
                    levelId: nextRoleDetail.levelId,
                    roleId: nextRoleDetail.roleId,
                    pathId: nextRoleDetail.pathId,
                    status: 'Pending',
                    message: `BOQ updated and moved to next level of verification`,
                    updatedAt: new Date()
                },
                { new: true }
            );

            // Emit notification for next level
            notificationEmitter.emit('notification', {
                userRoleId: nextRoleDetail.roleId,
                count: 1
            });

            // Get updated signatures and remarks
            const signatureAndRemarks = await getSignatureandRemakrs(id);

            return res.json({
                success: true,
                message: "BOQ updated and moved to next level",
                boq: {
                    ...boq.toObject(),
                    signatureAndRemarks
                }
            });
        } else {
            // Final approval
            boq.status = 'Approved';
            boq.boqStatus = 'Accepted';
            boq.updatedBy = req.user._id;
            await boq.save();

            // Update notification
            await NotificationHub.findOneAndUpdate(
                { 
                    relatedEntityId: id,
                    status: 'Pending'
                },
                {
                    status: 'Approved',
                    message: 'BOQ has been approved',
                    updatedAt: new Date()
                }
            );

            // Get final signatures and remarks
            const signatureAndRemarks = await getSignatureandRemakrs(id);

            return res.json({
                success: true,
                message: "BOQ approved successfully",
                boq: {
                    ...boq.toObject(),
                    signatureAndRemarks
                }
            });
        }
    } catch (error) {
        console.error('Error in updateBOQ:', error);
        res.status(500).json({ 
            success: false,
            error: error.message,
            message: 'Failed to update BOQ',
            code: error.code || 'UNKNOWN_ERROR'
        });
    }
};
const rejectBOQ = async (req, res) => {
    try {
        const { id, remarks } = req.body;

        if (!remarks) {
            return res.status(400).json({
                message: "Remarks are required for rejection"
            });
        }

        const boq = await BOQ.findOne({
            _id: id,
            status: 'Verification'
        });

        if (!boq) {
            return res.status(404).json({
                message: 'No BOQ found for verification'
            });
        }

        const { _id, levelId, businessOpportunity } = boq;

        // Update BOQ status
        boq.status = 'Rejected';
        boq.boqStatus = 'Rejected';
        boq.updatedBy = req.user._id;
        await boq.save();

        await BusinessOpportunity.findByIdAndUpdate(
            businessOpportunity,
            { 
                requestStatus: 'Accepted',
                updatedBy: req.user._id,
                updatedAt: new Date()
            }
        );

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

        return res.json({
            success: true,
            message: 'BOQ rejected successfully'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getAllBOQs = async (req, res) => {
    try {
        const boqs = await BOQ.find()
            .populate('businessOpportunity')
            .sort('-createdAt');
        res.json(boqs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getAcceptedBOQs = async (req, res) => {
    try {
        const boqs = await BOQ.find({ boqStatus: 'Accepted' })
            .populate('businessOpportunity')
            .sort('-createdAt');
        res.json(boqs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Function to fetch a single BOQ by ID
const getBOQById = async (req, res) => {
    try {
        const { id } = req.params;
        const boq = await BOQ.findById(id)
            .populate('businessOpportunity')
            

        if (!boq) {
            return res.status(404).json({
                success: false,
                message: 'BOQ not found'
            });
        }

        const signatureAndRemarks = await getSignatureandRemakrs(id);

        res.json({
            success: true,
            boq: {
                ...boq.toObject(),
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

// Function to return BOQ for revision
const returnBOQForRevision = async (req, res) => {
    try {
        const { id, remarks } = req.body;

        if (!remarks) {
            return res.status(400).json({
                message: "Remarks are required for returning BOQ"
            });
        }

        const boq = await BOQ.findOne({
            _id: id,
            status: 'Verification'
        });

        if (!boq) {
            return res.status(404).json({
                message: 'No BOQ found for verification'
            });
        }

        // Reset to initial level
        boq.levelId = 1;
        boq.boqStatus = 'Revision';
        boq.updatedBy = req.user._id;
        await boq.save();

        // Update notification
        await NotificationHub.findOneAndUpdate(
            { relatedEntityId: id },
            {
                levelId: 1,
                status: 'Pending',
                message: 'BOQ returned for revision'
            }
        );

        // Add signature and remarks
        await addSignatureAndRemarks(
            id,
            req.user.roleId,
            boq.levelId,
            remarks,
            req.user._id,
            req.user.userName
        );

        return res.json({
            success: true,
            message: 'BOQ returned for revision successfully'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Function to get BOQ history
const getBOQHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const signatureAndRemarks = await getSignatureandRemakrs(id);

        if (!signatureAndRemarks) {
            return res.status(404).json({
                success: false,
                message: 'No history found for this BOQ'
            });
        }

        res.json({
            success: true,
            history: signatureAndRemarks
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Function to delete uploaded attachment
const deleteAttachment = async (req, res) => {
    try {
        const { boqId, attachmentId } = req.params;

        const boq = await BOQ.findById(boqId);
        if (!boq) {
            return res.status(404).json({
                success: false,
                message: 'BOQ not found'
            });
        }

        const attachment = boq.attachments.id(attachmentId);
        if (!attachment) {
            return res.status(404).json({
                success: false,
                message: 'Attachment not found'
            });
        }

        // Delete file from storage
        try {
            await fs.promises.unlink(attachment.filePath);
        } catch (error) {
            console.error('Error deleting file:', error);
        }

        // Remove attachment from BOQ
        boq.attachments.pull(attachmentId);
        await boq.save();

        res.json({
            success: true,
            message: 'Attachment deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

module.exports = {
    createBOQ,
    updateBOQ,
    getBOQsForVerification,
    getAllBOQs,
    getAcceptedBOQs,
    rejectBOQ,
    getBOQById,
    returnBOQForRevision,
    getBOQHistory,
    deleteAttachment
};