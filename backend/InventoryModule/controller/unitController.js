const Unit = require('../models/unit');
const Permission = require('../../models/permissionModel');
const NotificationHub = require('../../models/notificationHubModel');
const SignatureandRemarks = require('../../models/signatureAndRemarksmodel');
const { UnitConversionService } = require('../services/unitConversionService');
const { UNIT_TYPES } = require('../constants/unitConstants');
const notificationEmitter = require('../../notificationEmitter');
const { addSignatureAndRemarks, getSignatureandRemakrs } = require('../../controllers/signatureAndRemarks');

// Helper function to check if user can approve at current level
const checkRoleApproval = async (unitId, roleId, levelId) => {
    const unit = await Unit.findById(unitId);
    if (!unit) {
        throw new Error('Unit not found');
    }

    const signatures = await SignatureandRemarks.find({
        entityId: unitId,
        levelId: levelId,
        roleId: roleId
    });

    if (signatures.length > 0) {
        throw new Error('This unit has already been processed at your role level');
    }

    return true;
};

// Helper function to create notification
const createNotification = async (unitId, workflowDetail, message) => {
    const newNotification = new NotificationHub({
        workflowId: 151,
        roleId: workflowDetail.roleId,
        pathId: workflowDetail.pathId,
        levelId: workflowDetail.levelId,
        relatedEntityId: unitId,
        message: message,
        status: 'Pending'
    });
    await newNotification.save();

    notificationEmitter.emit('notification', {
        userRoleId: workflowDetail.roleId,
        count: 1
    });

    return newNotification;
};

// Helper function to process unit updates
const processUnitUpdate = async (unitId, remarks, userRoleId, user) => {
    const unit = await Unit.findById(unitId);
    if (!unit) {
        throw new Error('Unit not found');
    }

    const { levelId } = unit;
    await checkRoleApproval(unitId, userRoleId, levelId);

    const permission = await Permission.findOne({ workflowId: 151 });
    if (!permission) {
        throw new Error('Permission not found');
    }

    // Add signature and remarks
    await addSignatureAndRemarks(
        unitId,
        userRoleId,
        levelId,
        remarks,
        user._id,
        user.userName
    );

    // Get next workflow level details
    const nextRoleDetail = permission.workflowDetails.find(
        detail => detail.levelId === levelId + 1
    );

    if (nextRoleDetail) {
        // Move to next level
        unit.levelId = nextRoleDetail.levelId;
        unit.updatedBy = user._id;
        await unit.save();

        await NotificationHub.findOneAndUpdate(
            { relatedEntityId: unitId, status: 'Pending' },
            {
                levelId: nextRoleDetail.levelId,
                roleId: nextRoleDetail.roleId,
                pathId: nextRoleDetail.pathId,
                message: `Unit moved to next level of verification`,
                updatedAt: new Date()
            }
        );

        notificationEmitter.emit('notification', {
            userRoleId: nextRoleDetail.roleId,
            count: 1
        });
    } else {
        // Final approval
        unit.status = 'Approved';
        unit.updatedBy = user._id;
        await unit.save();

        await NotificationHub.findOneAndUpdate(
            { relatedEntityId: unitId, status: 'Pending' },
            {
                status: 'Approved',
                message: 'Unit has been approved',
                updatedAt: new Date()
            }
        );
    }

    const signatureAndRemarks = await getSignatureandRemakrs(unitId);
    return {
        success: true,
        message: nextRoleDetail ? "Unit moved to next level" : "Unit approved successfully",
        unit: {
            ...unit.toObject(),
            signatureAndRemarks
        }
    };
};

// Helper function to process unit rejections
const processUnitRejection = async (unitId, remarks, user) => {
    const unit = await Unit.findOne({
        _id: unitId,
        status: 'Verification'
    });

    if (!unit) {
        throw new Error('No unit found for verification');
    }

    unit.status = 'Rejected';
    unit.updatedBy = user._id;
    await unit.save();

    await NotificationHub.findOneAndUpdate(
        { relatedEntityId: unitId },
        { status: 'Rejected' }
    );

    await addSignatureAndRemarks(
        unitId,
        user.roleId,
        unit.levelId,
        remarks,
        user._id,
        user.userName
    );

    return {
        success: true,
        message: 'Unit rejected successfully',
        unit: {
            ...unit.toObject(),
            status: 'Rejected'
        }
    };
};

const createUnit = async (req, res) => {
    try {
        const {
            name,
            symbol,
            type,
            baseUnit,
            applicableTypes,
            serviceCategory,
            conversions,
            remarks,
            isBulk,
            batchId
        } = req.body;

        // Validate unit type
        if (!Object.values(UNIT_TYPES).includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid unit type'
            });
        }

        // Check for existing unit
        const existingUnit = await Unit.findOne({
            $or: [
                { name: name.toUpperCase() },
                { symbol: symbol.toUpperCase() }
            ]
        });

        if (existingUnit) {
            return res.status(400).json({
                success: false,
                message: 'Unit with this name or symbol already exists'
            });
        }

        // Create new unit first
        const unit = new Unit({
            name: name.toUpperCase(),
            symbol: symbol.toUpperCase(),
            type,
            baseUnit: baseUnit || false,
            applicableTypes,
            serviceCategory,
            conversions: [], // Initialize empty, will be updated after unit creation
            status: 'Verification',
            levelId: 1,
            createdBy: req.user._id,
            creationType: isBulk ? 'BULK' : 'SINGLE',
            batchId: batchId || null
        });

        await unit.save();

        // Handle conversions if provided
        if (conversions && conversions.length > 0) {
            const conversionPromises = conversions.map(async (conversion) => {
                try {
                    // First try to find the target unit by symbol
                    const toUnit = await Unit.findOne({ 
                        symbol: conversion.toUnitSymbol.toUpperCase() 
                    });

                    if (!toUnit) {
                        console.warn(`Target unit ${conversion.toUnitSymbol} not found`);
                        return null;
                    }

                    return {
                        toUnit: toUnit._id,
                        factor: parseFloat(conversion.factor)
                    };
                } catch (error) {
                    console.error(`Error processing conversion: ${error.message}`);
                    return null;
                }
            });

            const validConversions = (await Promise.all(conversionPromises))
                .filter(conv => conv !== null);

            if (validConversions.length > 0) {
                unit.conversions = validConversions;
                await unit.save();
            }

            // Add conversions to UnitConversionService
            for (const conversion of conversions) {
                try {
                    await UnitConversionService.addConversion(
                        unit.symbol,
                        conversion.toUnitSymbol,
                        conversion.factor
                    );
                } catch (error) {
                    console.error(`Error adding conversion to service: ${error.message}`);
                }
            }
        }

        // Add signature and remarks
        await addSignatureAndRemarks(
            unit._id,
            req.user.roleId,
            0,
            remarks || 'Unit Created',
            req.user._id,
            req.user.userName
        );

        // Create notification for first level approver
        const permission = await Permission.findOne({ workflowId: 151 });
        if (!permission) {
            throw new Error('Workflow not found');
        }

        const workflowDetail = permission.workflowDetails.find(detail => detail.levelId === 1);
        await createNotification(unit._id, workflowDetail, `New Unit Created: ${unit.symbol}`);

        // Fetch the saved unit with populated conversions
        const savedUnit = await Unit.findById(unit._id).populate('conversions.toUnit');

        res.status(201).json({
            success: true,
            message: 'Unit created successfully and sent for verification',
            data: savedUnit
        });

    } catch (error) {
        console.error('Unit creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create unit',
            error: error.message
        });
    }
};
// Get all units
const getAllUnits = async (req, res) => {
    try {
        const { type, applicableType, active, search } = req.query;

        let query = {};

        // Add filters
        if (type) {
            query.type = type;
        }
        if (applicableType) {
            query.applicableTypes = applicableType;
        }
        if (active !== undefined) {
            query.active = active === 'true';
        }
        if (search) {
            query.$or = [
                { name: new RegExp(search, 'i') },
                { symbol: new RegExp(search, 'i') }
            ];
        }

        const units = await Unit.find(query)
            .populate('conversions.toUnit')
            .sort('type name');

        res.json({
            success: true,
            data: units
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch units',
            error: error.message
        });
    }
};

// Get units for verification
const getUnitsForVerification = async (req, res) => {
    try {
        const userRoleId = parseInt(req.query.userRoleId);
        console.log('1. Received userRoleId:', userRoleId);

        if (isNaN(userRoleId)) {
            
            return res.status(400).json({ message: 'Invalid userRoleId provided' });
        }

        const permission = await Permission.findOne({ workflowId: 151 });
        

        if (!permission) {
           
            return res.status(404).json({ message: 'Workflow not found' });
        }

        const relevantWorkflowDetails = permission.workflowDetails.filter(
            detail => detail.roleId === userRoleId
        );
        console.log('3. Relevant workflow details:', relevantWorkflowDetails);

        if (relevantWorkflowDetails.length === 0) {
            
            return res.status(403).json({
                message: 'Access denied: No matching workflow details found for this role',
                units: []
            });
        }

        const notifications = await NotificationHub.find({
            workflowId: 151,
            roleId: userRoleId,
            pathId: { $in: relevantWorkflowDetails.map(detail => detail.pathId) },
            status: 'Pending'
        });
        

        const unitIds = notifications.map(notification => notification.relatedEntityId);
        

        const units = await Unit.find({
            _id: { $in: unitIds },
            status: 'Verification',
            levelId: { $in: relevantWorkflowDetails.map(detail => detail.levelId) }
        })
       
        


        // Group units by batch for bulk uploads
        const processedUnits = units.reduce((acc, unit) => {
            if (unit.creationType === 'BULK') {
                const batchGroup = acc.find(group => group.batchId === unit.batchId);
                if (batchGroup) {
                    batchGroup.units.push(unit);
                } else {
                    acc.push({
                        batchId: unit.batchId,
                        creationType: 'BULK',
                        createdAt: unit.createdAt,
                        units: [unit]
                    });
                }
            } else {
                acc.push(unit);
            }
            return acc;
        }, []);

       

        const unitsWithSignatures = await Promise.all(
            processedUnits.map(async (item) => {
                if (item.creationType === 'BULK') {
                    const unitsWithSigs = await Promise.all(
                        item.units.map(async (unit) => ({
                            ...unit.toObject(),
                            signatureAndRemarks: await getSignatureandRemakrs(unit._id)
                        }))
                    );
                    return {
                        ...item,
                        units: unitsWithSigs
                    };
                } else {
                    return {
                        ...item.toObject(),
                        signatureAndRemarks: await getSignatureandRemakrs(item._id)
                    };
                }
            })
        );


        res.json({
            success: true,
            message: 'Units retrieved successfully',
            units: unitsWithSignatures
        });

    } catch (error) {
        console.error('Error in getUnitsForVerification:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch units for verification',
            error: error.message
        });
    }
};

// Update unit status (approve/move to next level)
const updateUnitStatus = async (req, res) => {
    try {
        const { id, batchId } = req.params;
        const { remarks } = req.body;
        
        if (!remarks) {
            return res.status(400).json({
                message: "Remarks are required for verification"
            });
        }

        if (batchId) {
            // Handle bulk approval
            const units = await Unit.find({ batchId });
            const results = await Promise.all(
                units.map(unit => 
                    processUnitUpdate(unit._id, remarks, req.user.roleId, req.user)
                )
            );

            // Reinitialize conversion cache after bulk approval
            if (results.some(result => result.unit.status === 'Approved')) {
                await UnitConversionService.initializeCache();
            }

            res.json({
                success: true,
                message: "Batch units processed successfully",
                results
            });
        } else {
            // Handle single unit approval
            const result = await processUnitUpdate(id, remarks, req.user.roleId, req.user);
            
            // Reinitialize conversion cache if unit was approved
            if (result.unit.status === 'Approved') {
                await UnitConversionService.initializeCache();
            }

            res.json(result);
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update unit status',
            error: error.message
        });
    }
};

// Reject unit
const rejectUnit = async (req, res) => {
    try {
        const { id, batchId, remarks } = req.body;

        if (!remarks) {
            return res.status(400).json({
                message: "Remarks are required for rejection"
            });
        }

        if (batchId) {
            // Handle bulk rejection
            const units = await Unit.find({ 
                batchId,
                status: 'Verification'
            });

            const results = await Promise.all(
                units.map(unit => 
                    processUnitRejection(unit._id, remarks, req.user)
                )
            );

            res.json({
                success: true,
                message: "Batch units rejected successfully",
                results
            });
        } else {
            // Handle single unit rejection
            const result = await processUnitRejection(id, remarks, req.user);
            res.json(result);
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to reject unit',
            error: error.message
        });
    }
};

// Bulk upload units
const bulkUploadUnits = async (req, res) => {
    try {
        const { units } = req.body;
        const batchId = new Date().getTime().toString(); // Generate unique batch ID
        
        const results = {
            success: [],
            failures: []
        };

        const permission = await Permission.findOne({ workflowId: 151 });
        if (!permission) {
            throw new Error('Workflow not found');
        }

        const workflowDetail = permission.workflowDetails.find(detail => detail.levelId === 1);

        for (const unitData of units) {
            try {
                // Validate unit type
                if (!Object.values(UNIT_TYPES).includes(unitData.type)) {
                    throw new Error(`Invalid unit type for ${unitData.symbol}`);
                }

                // Check for existing unit
                const existingUnit = await Unit.findOne({
                    $or: [
                        { name: unitData.name.toUpperCase() },
                        { symbol: unitData.symbol.toUpperCase() }
                    ]
                });

                if (existingUnit) {
                    throw new Error(`Unit with name ${unitData.name} or symbol ${unitData.symbol} already exists`);
                }

                // Create new unit
                const unit = new Unit({
                    ...unitData,
                    name: unitData.name.toUpperCase(),
                    symbol: unitData.symbol.toUpperCase(),
                    status: 'Verification',
                    levelId: 1,
                    createdBy: req.user._id,
                    creationType: 'BULK',
                    batchId
                });

                await unit.save();

                // Add conversions if provided
                if (unitData.conversions && unitData.conversions.length > 0) {
                    for (const conversion of unitData.conversions) {
                        await UnitConversionService.addConversion(
                            unit.symbol,
                            conversion.toUnitSymbol,
                            conversion.factor
                        );
                    }
                }

                // Add signature and remarks
                await addSignatureAndRemarks(
                    unit._id,
                    req.user.roleId,
                    0,
                    'Unit Created via Bulk Upload',
                    req.user._id,
                    req.user.userName
                );

                // Create notification
                await createNotification(
                    unit._id,
                    workflowDetail,
                    `New Unit Created via Bulk Upload: ${unit.symbol}`
                );

                results.success.push(unit.symbol);
            } catch (error) {
                results.failures.push({
                    symbol: unitData.symbol,
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            message: 'Bulk upload completed and units sent for verification',
            results
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Bulk upload failed',
            error: error.message
        });
    }
};

// Get unit by ID
const getUnitById = async (req, res) => {
    try {
        const unit = await Unit.findById(req.params.id)
            .populate('conversions.toUnit')
            .populate('createdBy', 'userName')
            .populate('updatedBy', 'userName');

        if (!unit) {
            return res.status(404).json({
                success: false,
                message: 'Unit not found'
            });
        }

        const signatureAndRemarks = await getSignatureandRemakrs(req.params.id);

        res.json({
            success: true,
            data: {
                ...unit.toObject(),
                signatureAndRemarks
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch unit',
            error: error.message
        });
    }
};

// Update unit
const updateUnit = async (req, res) => {
    try {
        const {
            name,
            type,
            baseUnit,
            applicableTypes,
            serviceCategory,
            active
        } = req.body;

        const unit = await Unit.findById(req.params.id);
        if (!unit) {
            return res.status(404).json({
                success: false,
                message: 'Unit not found'
            });
        }

        // Cannot change symbol as it might break existing conversions
        unit.name = name?.toUpperCase() || unit.name;
        unit.type = type || unit.type;
        unit.baseUnit = baseUnit !== undefined ? baseUnit : unit.baseUnit;
        unit.applicableTypes = applicableTypes || unit.applicableTypes;
        unit.serviceCategory = serviceCategory || unit.serviceCategory;
        unit.active = active !== undefined ? active : unit.active;
        unit.updatedBy = req.user._id;

        await unit.save();

        // Reinitialize conversion cache if unit was deactivated
        if (active === false) {
            await UnitConversionService.initializeCache();
        }

        res.json({
            success: true,
            message: 'Unit updated successfully',
            data: unit
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update unit',
            error: error.message
        });
    }
};

// Add/Update conversion
const updateConversion = async (req, res) => {
    try {
        const { fromUnitSymbol, toUnitSymbol, factor } = req.body;

        if (!factor || factor <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid conversion factor'
            });
        }

        await UnitConversionService.addConversion(
            fromUnitSymbol,
            toUnitSymbol,
            factor
        );

        // Reinitialize conversion cache
        await UnitConversionService.initializeCache();

        res.json({
            success: true,
            message: 'Conversion updated successfully'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update conversion',
            error: error.message
        });
    }
};

// Get units by type
// Backend controller
const getUnitsByType = async (req, res) => {
    try {
        const { type } = req.params;  // This will be 'MATERIAL' or 'SERVICE'
        const { excludeUnit } = req.query;

        console.log('Requested applicableType:', type);

        if (!['MATERIAL', 'SERVICE'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid type. Must be either MATERIAL or SERVICE'
            });
        }

        // Build query to find units that are either specific to this type or marked as 'BOTH'
        const query = { 
            status: 'Approved',
            active: true,
            $or: [
                { applicableTypes: type },
                { applicableTypes: 'BOTH' }
            ]
        };

        if (excludeUnit) {
            query.symbol = { $ne: excludeUnit };
        }

        const units = await Unit.find(query)
            .select('name symbol type baseUnit active applicableTypes')
            .sort('name');

        console.log(`Found ${units.length} units for type ${type}`);

        const formattedUnits = units.map(unit => ({
            _id: unit._id,
            name: unit.name,
            symbol: unit.symbol,
            baseUnit: unit.baseUnit,
            type: unit.type,
            applicableTypes: unit.applicableTypes,
            displayName: `${unit.name} (${unit.symbol})${unit.baseUnit ? ' - Base Unit' : ''}`
        }));

        res.json({
            success: true,
            message: `Found ${units.length} active units for ${type}`,
            data: formattedUnits
        });

    } catch (error) {
        console.error('Error in getUnitsByType:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch units',
            error: error.message
        });
    }
};
// Get unit conversions
const getUnitConversions = async (req, res) => {
    try {
        const { unitSymbol } = req.params;
        const conversions = await UnitConversionService.getPossibleConversions(unitSymbol);

        res.json({
            success: true,
            data: conversions
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch conversions',
            error: error.message
        });
    }
};

// Get unit history
const getUnitHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const signatureAndRemarks = await getSignatureandRemakrs(id);

        if (!signatureAndRemarks) {
            return res.status(404).json({
                success: false,
                message: 'No history found for this unit'
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

module.exports = {
    createUnit,
    getAllUnits,
    getUnitsForVerification,
    updateUnitStatus,
    rejectUnit,
    bulkUploadUnits,
    getUnitById,
    updateUnit,
    updateConversion,
    getUnitsByType,
    getUnitConversions,
    getUnitHistory
};