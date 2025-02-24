const Unit = require('../models/unit');
const WorkflowService = require('../../controllers/workflowService');
const { UnitConversionService } = require('../services/unitConversionService');
const { UNIT_TYPES } = require('../constants/unitConstants');


const unitWorkflow = new WorkflowService({
    workflowId: 151,
    Model: Unit,
    entityType: 'Unit',
    getNotificationMessage: (entity, action) => {
        switch(action) {
            case 'created':
                return `New Unit Created: ${entity.symbol}`;
            case 'nextLevel':
                return 'Unit moved to next level of verification';
            case 'approved':
                return 'Unit has been approved';
            case 'rejected':
                return 'Unit has been rejected';
            default:
                return `Unit ${action}`;
        }
    }
});


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
            ],
            status: { $ne: 'Rejected' }
        });

        if (existingUnit) {
            return res.status(400).json({
                success: false,
                message: 'Unit with this name or symbol already exists'
            });
        }

        // Prepare unit data
        const unitData = {
            name: name.toUpperCase(),
            symbol: symbol.toUpperCase(),
            type,
            baseUnit: baseUnit || false,
            applicableTypes,
            serviceCategory,
            conversions: [], // Start with empty conversions
            status: 'Verification',
            levelId: 1,
            creationType: isBulk ? 'BULK' : 'SINGLE',
            batchId: batchId || null
        };

        // Create unit through workflow
        const { entity: unit } = await unitWorkflow.createEntity(
            unitData,
            req.user,
            remarks || 'Unit Created'
        );

        // Handle conversions if provided
        if (conversions && conversions.length > 0) {
            try {
                // Store conversions in unit model format
                const processedConversions = conversions.map(conversion => ({
                    toUnit: conversion.toUnit,
                    toUnitSymbol: conversion.toUnitSymbol.toUpperCase(),
                    factor: conversion.factor
                }));
                
                unit.conversions = processedConversions;
                await unit.save();

                // Note: We don't add to UnitConversionService until unit is approved
                // This will be handled in the approval workflow
            } catch (error) {
                console.error('Conversion processing error:', error);
                throw new Error(`Failed to process conversions: ${error.message}`);
            }
        }

        // Fetch the saved unit with all details
        const savedUnit = await Unit.findById(unit._id)
           

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
        const { type } = req.query;

        if (isNaN(userRoleId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid userRoleId provided'
            });
        }

        const result = await unitWorkflow.getEntitiesForVerification(userRoleId);

        // Handle bulk verification requests
        if (type === 'bulk') {
            const bulkUnits = result.data.reduce((acc, unit) => {
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
                }
                return acc;
            }, []);

            return res.json({
                success: true,
                message: 'Bulk units retrieved successfully',
                units: bulkUnits
            });
        }

        res.json({
            success: true,
            message: 'Units retrieved successfully',
            units: result.data
        });

    } catch (error) {
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
                    unitWorkflow.verifyEntity(unit._id, req.user, remarks)
                )
            );

            // Reinitialize conversion cache after bulk approval
            if (results.some(result => result.data.status === 'Approved')) {
                await UnitConversionService.initializeCache();
            }

            res.json({
                success: true,
                message: "Batch units processed successfully",
                results
            });
        } else {
            // Handle single unit approval
            const result = await unitWorkflow.verifyEntity(id, req.user, remarks);
            
            // Reinitialize conversion cache if unit was approved
            if (result.data.status === 'Approved') {
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
        console.log('Reject request body:', req.body);
        
        if (!remarks) {
            return res.status(400).json({
                success: false,
                message: "Remarks are required for rejection"
            });
        }

        if (batchId) {
            console.log('Attempting batch rejection:', batchId);
            // Your batch rejection code
        } else if (id) {
            console.log('Attempting single unit rejection:', id);
            try {
                const result = await unitWorkflow.rejectEntity(id, req.user, remarks);
                console.log('Rejection result:', result);
                return res.json({
                    success: true,
                    message: 'Unit rejected successfully',
                    data: result
                });
            } catch (error) {
                console.error('Rejection error:', error);
                throw error;
            }
        } else {
            return res.status(400).json({
                success: false,
                message: 'Either id or batchId is required for rejection'
            });
        }
    } catch (error) {
        console.error('Controller error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to reject unit'
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

const getUnitsByType = async (req, res) => {
    try {
        const { type } = req.params;  // This will be a UNIT_TYPE (e.g., 'WEIGHT', 'LENGTH', etc.)
        const { excludeUnit } = req.query;

        console.log('Requested unit type:', type);

        // Validate unit type
        if (!Object.values(UNIT_TYPES).includes(type)) {
            return res.status(400).json({
                success: false,
                message: `Invalid unit type. Must be one of: ${Object.values(UNIT_TYPES).join(', ')}`
            });
        }

        // Build query to find units of the specified type
        const query = { 
            type,             // Filter by unit type (WEIGHT, LENGTH, etc.)
            status: 'Approved',
            active: true
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


// In your backend controller
const getUnitsByCategory = async (req, res) => {
    try {
        const { category } = req.params;
        
        const query = { 
            status: 'Approved',
            active: true,
            applicableTypes: {
                $in: [category, 'BOTH']
            }
        };

        const units = await Unit.find(query)
            .select('name symbol type baseUnit')
            .sort('name');

        // Return simple array of units directly
        res.json(units);

    } catch (error) {
        res.status(500).json({
            message: 'Failed to fetch units by category'
        });
    }
};

//support for Available unit 
const getUnitTypeBySymbol = async (unitSymbol) => {
    try {
        const unit = await Unit.findOne({ 
            symbol: unitSymbol.toUpperCase(),
            status: 'Approved',
            active: true
        });
        
        if (!unit) {
            throw new Error(`No active unit found with symbol ${unitSymbol}`);
        }
        
        return unit.type; // Returns the UNIT_TYPE (e.g., 'WEIGHT', 'LENGTH', etc.)
    } catch (error) {
        throw new Error(`Error finding unit type: ${error.message}`);
    }
};

//function for allowed units for one item
const getAllowedUnitsByBaseCode = async (req, res) => {
    try {
        const { primaryUnit } = req.params;
        
        // Validate input
        if (!primaryUnit) {
            return res.status(400).json({
                success: false,
                message: 'Primary unit is required'
            });
        }

        // Get the unit type for the primary unit
        const unitType = await getUnitTypeBySymbol(primaryUnit);
        
        if (!unitType) {
            return res.status(400).json({
                success: false,
                message: `Could not determine unit type for ${primaryUnit}`
            });
        }

        // Find all active units of the same type
        const units = await Unit.find({
            type: unitType,
            status: 'Approved',
            active: true
        }).select('name symbol type baseUnit');

        // Format the response
        const formattedUnits = units.map(unit => ({
            _id: unit._id,
            name: unit.name,
            symbol: unit.symbol,
            baseUnit: unit.baseUnit,
            type: unit.type,
            isPrimaryUnit: unit.symbol === primaryUnit.toUpperCase(),
            displayName: `${unit.symbol} - ${unit.name}${unit.baseUnit ? ' (Base Unit)' : ''}`
        }));

        res.json({
            success: true,
            message: `Found ${units.length} allowed units for primary unit ${primaryUnit}`,
            data: {
                unitType,
                units: formattedUnits
            }
        });

    } catch (error) {
        console.error('Error in getAllowedUnitsByBaseCode:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch allowed units',
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
    getUnitHistory,
    getUnitsByCategory,
    getAllowedUnitsByBaseCode
};