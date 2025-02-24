// baseCodeController.js
const mongoose = require('mongoose');
const ItemCode = require('../models/ItemCode');
const SpecificationCode = require('../models/SpecificationCode');
const Unit = require('../models/unit');
const HsnSac = require('../../TaxModule/models/HsnSac');
const DCA = require('../../models/dcacodeModel');
const SubDCA = require('../../models/subDCAModel');
const { UnitConversionService } = require('../services/unitConversionService');
const { calculatePriceConversions } = require('../services/priceConversion');
const WorkflowService = require('../../controllers/workflowService');
const multerConfig = require('../../config/multerConfig');
const {cleanupFiles} = require('../../config/cleanUpConfig')
const XLSX = require('xlsx');
const CodeGenerationService = require('../services/codeGenerationServices');
const { trim } = require('validator');
const { ASSET_CATEGORIES } = require('../constants/materialConstants');
const SpecificationCodeGenerationService = require('../services/specificationCodeServices');

// Initialize workflow services
const baseCodeWorkflow = new WorkflowService({
    workflowId: 149,
    Model: ItemCode,
    entityType: 'Base Code',
    getNotificationMessage: (entity, action) => {
        switch(action) {
            case 'created':
                return `New Base Code Created: ${entity.baseCode}`;
            case 'nextLevel':
                return 'Base code moved to next level of verification';
            case 'approved':
                return 'Base code has been approved';
            case 'rejected':
                return 'Base code has been rejected';
            default:
                return `Base code ${action}`;
        }
    }
});

const specificationWorkflow = new WorkflowService({
    workflowId: 152,
    Model: SpecificationCode,
    entityType: 'Specification',
    getNotificationMessage: (entity, action, specData) => {
        const specCode = specData?.fullCode || '';
        switch(action) {
            case 'created':
                return `New Specification Added: ${specCode}`;
            case 'nextLevel':
                return 'Specification moved to next level of verification';
            case 'approved':
                return 'Specification has been approved';
            case 'rejected':
                return 'Specification has been rejected';
            default:
                return `Specification ${action}`;
        }
    }
});

// Validation Helpers
const validateBaseCodeData = async (data) => {

    const requiredFields = ['type', 'itemName', 'categoryCode', 'majorGroupCode', 'hsnSac', 'dcaCode', 'subDcaCode','primaryUnit'];
    const missingFields = requiredFields.filter(field => !data[field]);
    if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    const existingItemCode = await ItemCode.findOne({ 
        itemName: { $regex: new RegExp(`^${data.itemName}$`, 'i') }
    });
    if (existingItemCode) {
        throw new Error(`Item name "${data.itemName}" already exists`);
    }

    const hsnSac = await HsnSac.findOne({ code: data.hsnSac });
    if (!hsnSac) {
        throw new Error('Invalid HSN/SAC code');
    }
    
    if (!((data.type === 'MATERIAL' && (hsnSac.applicableType === 'MATERIAL' || hsnSac.applicableType === 'BOTH')) || 
          (data.type === 'SERVICE' && (hsnSac.applicableType === 'SERVICE' || hsnSac.applicableType === 'BOTH')))) {
        throw new Error(`Selected ${hsnSac.type} code is not applicable for ${data.type} type`);
    }

    const dca = await DCA.findOne({ code: data.dcaCode });
    if (!dca) {
        throw new Error('Invalid DCA code');
    }

    const subDca = await SubDCA.findOne({ 
        dcaCode: data.dcaCode,
        subCode: data.subDcaCode 
    });
    if (!subDca) {
        throw new Error('Invalid SubDCA code');
    }

    return true;
};


// Base Code Creation

const createBaseCode = async (req, res) => {
    try {
        const isExcelUpload = req.body.isExcelUpload === 'true';
        
        if (isExcelUpload) {
            let parsedData;
            try {
                parsedData = JSON.parse(req.body.data);
                console.log('Parsed bulk data:', parsedData);

                const remarks = req.body.remarks || 'Bulk upload';
                const batchId = new mongoose.Types.ObjectId();
                const results = { success: [], errors: [] };

                for (const item of parsedData) {
                    try {
                        // Generate code
                        const { nameCode, baseCode } = await CodeGenerationService.generateNextCode(
                            item.type,
                            item.categoryCode,
                            item.majorGroupCode
                        );

                        const itemToCreate = {
                            type: item.type,
                            categoryCode: item.categoryCode,
                            majorGroupCode: item.majorGroupCode,
                            itemName: item.itemName,
                            primaryUnit: item.primaryUnit,
                            hsnSac: item.hsnSac,
                            dcaCode: item.dcaCode,
                            subDcaCode: item.subDcaCode,
                            isAsset: item.isAsset || false,
                            nameCode,
                            baseCode,
                            uploadBatch: batchId,
                            remarks,
                            status: 'Verification',
                            levelId: 1,
                            active: true
                        };

                        // Handle asset category if it exists
                        if (itemToCreate.isAsset && item.assetCategory) {
                            itemToCreate.assetCategory = item.assetCategory;
                        }

                        // Validate
                        await validateBaseCodeData(itemToCreate);

                        // Create through workflow
                        const result = await baseCodeWorkflow.createEntity(
                            itemToCreate,
                            req.user,
                            remarks
                        );

                        results.success.push({
                            itemName: itemToCreate.itemName,
                            baseCode: result.entity.baseCode
                        });
                    } catch (error) {
                        console.error('Error processing item:', error);
                        results.errors.push({
                            itemName: item.itemName || 'Unknown Item',
                            error: error.message
                        });
                    }
                }

                return res.status(201).json({
                    success: true,
                    message: 'Base codes processed successfully',
                    data: {
                        batchId,
                        results
                    }
                });
            } catch (error) {
                console.error('JSON parsing error:', error);
                throw new Error(`Invalid data format: ${error.message}`);
            }
        } else {
            // Single item creation remains unchanged
            const data = req.body;

            if (data.isAsset && !data.assetCategory) {
                return res.status(400).json({
                    success: false,
                    error: 'Asset category is required when isAsset is true'
                });
            }
            
            const { nameCode, baseCode } = await CodeGenerationService.generateNextCode(
                data.type,
                data.categoryCode,
                data.majorGroupCode
            );

            const itemData = {
                ...data,
                nameCode,
                baseCode,
                status: 'Verification',
                levelId: 1,
                active: true
            };

            if (!itemData.isAsset) {
                delete itemData.assetCategory;
            }

            const result = await baseCodeWorkflow.createEntity(
                itemData,
                req.user,
                data.remarks || 'Single item creation'
            );

            res.status(201).json({
                success: true,
                message: 'Base code created successfully',
                data: result.entity
            });
        }
    } catch (error) {
        console.error('Base code creation error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
};
// Get Base Codes for Verification
const getBaseCodesForVerification = async (req, res) => {
    try {
        const userRoleId = parseInt(req.query.userRoleId);
        const { type } = req.query;

        if (isNaN(userRoleId)) {
            return res.status(400).json({ message: 'Invalid userRoleId' });
        }

        let query = { status: 'Verification', levelId: userRoleId };
        
        if (type === 'bulk') {
            const result = await baseCodeWorkflow.getEntitiesForVerification(userRoleId, {
                query: { uploadBatch: { $exists: true } },
                sort: { uploadBatch: 1 }
            });
            return res.json({
                success: true,
                message: 'Bulk base codes retrieved',
                data: result.data
            });
        }

        const result = await baseCodeWorkflow.getEntitiesForVerification(userRoleId, {
            query: { uploadBatch: { $exists: false } }
        });

        res.json({
            success: true,
            message: 'Base codes retrieved',
            data: result.data
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
// Base Code Verification
const verifyBaseCode = async (req, res) => {
    try {
        const { id, batchId, remarks } = req.body;
        if (!remarks) {
            return res.status(400).json({ message: "Remarks required" });
        }

        const results = { success: [], errors: [] };

        if (batchId) {
            // Bulk verification
            const itemCodes = await ItemCode.find({ 
                uploadBatch: batchId,
                status: 'Verification'
            });

            for (const itemCode of itemCodes) {
                try {
                    await baseCodeWorkflow.verifyEntity(itemCode._id, req.user, remarks);
                    results.success.push({ id: itemCode._id, baseCode: itemCode.baseCode });
                } catch (error) {
                    results.errors.push({ id: itemCode._id, error: error.message });
                }
            }
        } else if (id) {
            // Single verification
            try {
                const result = await baseCodeWorkflow.verifyEntity(id, req.user, remarks);
                return res.json({ success: true, data: result });
            } catch (error) {
                return res.status(500).json({ success: false, error: error.message });
            }
        }

        res.json({
            success: true,
            message: batchId ? 'Batch verification completed' : 'Item verified',
            results: batchId ? results : undefined
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};



// Reject Base Code
const rejectBaseCode = async (req, res) => {
    try {
        const { id, batchId, remarks } = req.body;
        
        if (!remarks) {
            return res.status(400).json({
                success: false,
                message: "Remarks are required for rejection"
            });
        }

        const results = { success: [], errors: [] };

        if (batchId) {
            // Bulk rejection by batch
            const itemCodes = await ItemCode.find({ 
                uploadBatch: batchId,
                status: 'Verification'
            });

            for (const itemCode of itemCodes) {
                try {
                    const result = await baseCodeWorkflow.rejectEntity(itemCode._id, req.user, remarks);
                    results.success.push({
                        id: itemCode._id,
                        baseCode: itemCode.baseCode,
                        message: 'Successfully rejected'
                    });
                } catch (error) {
                    results.errors.push({
                        id: itemCode._id,
                        baseCode: itemCode.baseCode,
                        error: error.message
                    });
                }
            }

            return res.json({
                success: true,
                message: 'Batch rejection completed',
                results
            });
        } else if (id) {
            // Single rejection
            const result = await baseCodeWorkflow.rejectEntity(id, req.user, remarks);
            return res.json({
                success: true,
                message: 'Base code rejected successfully',
                data: result
            });
        } else {
            return res.status(400).json({
                success: false,
                message: 'Either id or batchId is required for rejection'
            });
        }

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};


// Validate Specification Data
const validateSpecificationData = async (itemCode, data) => {
    // Check if make+specification combination already exists for this base code
    const existingSpec = await SpecificationCode.findOne({
        baseCode: itemCode.baseCode,
        make: { $regex: new RegExp(`^${data.make}$`, 'i') },
        specification: { $regex: new RegExp(`^${data.specification || ''}$`, 'i') }
    });
    
    if (existingSpec) {
        throw new Error(`Specification with make "${data.make}" already exists for this item`);
    }

    // Validate primary unit
    const primaryUnitDoc = await Unit.findById(data.primaryUnit);
    if (!primaryUnitDoc) {
        throw new Error('Invalid primary unit');
    }

    // Validate allowed units and their conversions
    if (data.allowedUnits && data.allowedUnits.length > 0) {
        for (const unitData of data.allowedUnits) {
            const unit = await Unit.findById(unitData.unit);
            if (!unit) {
                throw new Error(`Invalid unit in allowed units: ${unitData.unit}`);
            }
            
            // Check if allowed unit is of same type as primary unit
            if (unit.type !== primaryUnitDoc.type) {
                throw new Error(`Unit type mismatch. All units must be of type ${primaryUnitDoc.type}`);
            }
            
            // Check if conversion exists
            try {
                await UnitConversionService.validateUnitCompatibility(
                    primaryUnitDoc.symbol,
                    unit.symbol
                );
            } catch (error) {
                throw new Error(`Unit conversion not available between ${primaryUnitDoc.symbol} and ${unit.symbol}`);
            }
        }
    }

    return true;
};


// Create Specification
// Helper function to process a single specification
const processSpecification = async (data, user, remarks = '') => {
    try {
        // Find the item code by baseCode
        const itemCode = await ItemCode.findOne({ baseCode: data.baseCode });
        if (!itemCode) {
            throw new Error(`Item code not found for base code: ${data.baseCode}`);
        }

        if (itemCode.status !== 'Approved') {
            throw new Error(`Base code ${data.baseCode} is not approved`);
        }

        // Validate the specification data
        await validateSpecificationData(itemCode, data);

        // Generate specification code
        const specCode = await SpecificationCodeGenerationService.generateNextSpecificationCode(itemCode._id);

        // Create the specification object - this is the key part that needs fixing
        const specificationData = {
            baseCodeId: itemCode._id,
            baseCode: itemCode.baseCode,
            scode: specCode.scode,
            fullCode: specCode.fullCode,
            make: data.make.trim(),
            specification: data.specification?.trim() || '',
            primaryUnit: data.primaryUnit,  // Make sure this is the ObjectId
            standardPrice: parseFloat(data.standardPrice),
            allowedUnits: data.allowedUnits, // Array of {unit: ObjectId, isDefault: boolean}
            priceReferences: data.priceReferences,
            status: 'Verification',
            levelId: 1,
            active: true,
            remarks
        };

        // Create specification through workflow
        // Note: Now passing specificationData directly, not as a nested property
        const result = await specificationWorkflow.createEntity(
            specificationData,
            user,
            remarks
        );

        return {
            success: true,
            baseCode: itemCode.baseCode,
            data: result.entity
        };

    } catch (error) {
        throw new Error(`Failed to process specification for base code ${data.baseCode}: ${error.message}`);
    }
};
// Main specification creation function
const createSpecification = async (req, res) => {
    try {
        const isExcelUpload = req.body.isExcelUpload === 'true';
        
        if (isExcelUpload) {
            let parsedData;
            try {
                parsedData = JSON.parse(req.body.data);
                console.log('Parsed bulk data:', parsedData);

                const remarks = req.body.remarks || 'Bulk upload';
                const batchId = new mongoose.Types.ObjectId();
                const results = { success: [], errors: [] };

                for (const spec of parsedData) {
                    try {
                        const result = await processSpecification(
                            {
                                ...spec,
                                batchId
                            },
                            req.user,
                            remarks
                        );

                        results.success.push({
                            make: spec.make,
                            specification: spec.specification,
                            baseCode: spec.baseCode,
                            fullCode: result.data.specifications[result.data.specifications.length - 1].fullCode
                        });
                    } catch (error) {
                        console.error('Error processing specification:', error);
                        results.errors.push({
                            make: spec.make || 'Unknown Make',
                            specification: spec.specification || 'Unknown Specification',
                            baseCode: spec.baseCode,
                            error: error.message
                        });
                    }
                }

                return res.status(201).json({
                    success: true,
                    message: 'Specifications processed successfully',
                    data: {
                        batchId,
                        results
                    }
                });
            } catch (error) {
                console.error('JSON parsing error:', error);
                throw new Error(`Invalid data format: ${error.message}`);
            }
        } else {
            // Single specification creation
            const result = await processSpecification(
                req.body,
                req.user,
                req.body.remarks || 'Single specification creation'
            );

            return res.status(201).json({
                success: true,
                message: 'Specification created successfully',
                data: result.data
            });
        }
    } catch (error) {
        console.error('Specification creation error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
};

// Get Specifications for Verification
// Get Specifications for Verification
const getSpecificationsForVerification = async (req, res) => {
    try {
        console.log('Hitting specification verification route');
        const userRoleId = parseInt(req.query.userRoleId);
        const { type } = req.query;

        if (isNaN(userRoleId)) {
            return res.status(400).json({ message: 'Invalid userRoleId' });
        }
        
        // Determine query options based on type
        const queryOptions = {
            query: type === 'bulk' 
                ? { uploadBatch: { $exists: true } } 
                : { uploadBatch: { $exists: false } }
        };
        
        // Add sorting if needed for bulk
        if (type === 'bulk') {
            queryOptions.sort = { uploadBatch: 1 };
        }
        
        // Get specifications from workflow service
        const result = await specificationWorkflow.getEntitiesForVerification(userRoleId, queryOptions);
        
        if (!result.data || !Array.isArray(result.data)) {
            return res.json({
                success: true,
                message: 'No specifications found for verification',
                specifications: []
            });
        }
        
        // Get all baseCodeIds and unitIds for batch queries
        const baseCodeIds = result.data.map(spec => spec.baseCodeId).filter(Boolean);
        const primaryUnitIds = result.data.map(spec => spec.primaryUnit).filter(Boolean);
        
        // Create sets for unique IDs
        const uniqueBaseCodeIds = [...new Set(baseCodeIds.map(id => id.toString()))];
        const uniquePrimaryUnitIds = [...new Set(primaryUnitIds.map(id => id.toString()))];
        
        // Get all allowed unit IDs
        const allowedUnitIds = [];
        for (const spec of result.data) {
            if (spec.allowedUnits && Array.isArray(spec.allowedUnits)) {
                for (const unitData of spec.allowedUnits) {
                    if (unitData.unit) {
                        allowedUnitIds.push(unitData.unit.toString());
                    }
                }
            }
        }
        const uniqueAllowedUnitIds = [...new Set(allowedUnitIds)];
        
        // Batch fetch all needed data
        const [itemCodes, primaryUnits, allowedUnits] = await Promise.all([
            ItemCode.find({ _id: { $in: uniqueBaseCodeIds } }).lean(),
            Unit.find({ _id: { $in: uniquePrimaryUnitIds } }).lean(),
            Unit.find({ _id: { $in: uniqueAllowedUnitIds } }).lean()
        ]);
        
        // Create lookup maps
        const itemCodeMap = itemCodes.reduce((map, item) => {
            map[item._id.toString()] = item;
            return map;
        }, {});
        
        const primaryUnitMap = primaryUnits.reduce((map, unit) => {
            map[unit._id.toString()] = unit;
            return map;
        }, {});
        
        const allowedUnitMap = allowedUnits.reduce((map, unit) => {
            map[unit._id.toString()] = unit;
            return map;
        }, {});
        
        // Process specifications with the fetched data
        const processedSpecs = result.data.map(spec => {
            // Convert Mongoose document to plain object if needed
            const specObj = spec.toObject ? spec.toObject({ virtuals: true }) : (spec._doc || spec);
            
            // Get item name from map
            const itemCode = specObj.baseCodeId ? itemCodeMap[specObj.baseCodeId.toString()] : null;
            const itemName = itemCode ? itemCode.itemName : 'Unknown';
            
            // Get primary unit from map
            const primaryUnit = specObj.primaryUnit ? primaryUnitMap[specObj.primaryUnit.toString()] : null;
            
            // Process allowed units
            const processedAllowedUnits = Array.isArray(specObj.allowedUnits)
                ? specObj.allowedUnits.map(unitData => {
                    const unitId = unitData.unit ? unitData.unit.toString() : null;
                    const unit = unitId ? allowedUnitMap[unitId] : null;
                    
                    return {
                        ...unitData,
                        unit: unit ? {
                            _id: unit._id,
                            symbol: unit.symbol,
                            name: unit.name
                        } : unitData.unit
                    };
                })
                : [];
            
            // Return the processed specification
            return {
                itemCodeId: specObj.baseCodeId,
                baseCode: specObj.baseCode,
                itemName: itemName,
                specification: {
                    ...specObj,
                    primaryUnit: primaryUnit ? {
                        _id: primaryUnit._id,
                        symbol: primaryUnit.symbol,
                        name: primaryUnit.name
                    } : specObj.primaryUnit,
                    allowedUnits: processedAllowedUnits,
                    signatureAndRemarks: specObj.signatureAndRemarks || []
                }
            };
        });
        
        return res.json({
            success: true,
            message: 'Specifications retrieved for verification',
            specifications: processedSpecs
        });
    } catch (error) {
        console.error('Error in getSpecificationsForVerification:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
};
// Verify Specification
const verifySpecification = async (req, res) => {
    try {
        const { itemCodeId, specificationId, bulk, specifications, remarks } = req.body;
        
        if (!remarks) {
            return res.status(400).json({ 
                success: false,
                message: "Remarks required" 
            });
        }

        const results = { success: [], errors: [] };

        if (bulk && specifications && Array.isArray(specifications)) {
            // Bulk verification
            for (const spec of specifications) {
                try {
                    // Make sure we have the required ID
                    if (!spec.specificationId) {
                        throw new Error('Missing specification ID');
                    }

                    const result = await specificationWorkflow.verifyEntity(
                        spec.specificationId,
                        req.user,
                        remarks
                    );

                    results.success.push({ 
                        specificationId: spec.specificationId, 
                        itemCodeId: spec.itemCodeId,
                        fullCode: result.data?.fullCode || 'Unknown' 
                    });
                } catch (error) {
                    console.error('Error verifying specification:', error);
                    results.errors.push({ 
                        specificationId: spec.specificationId, 
                        itemCodeId: spec.itemCodeId,
                        error: error.message 
                    });
                }
            }
        } else if (specificationId) {
            // Single verification
            try {
                const result = await specificationWorkflow.verifyEntity(
                    specificationId,
                    req.user,
                    remarks
                );
                return res.json({ success: true, data: result });
            } catch (error) {
                return res.status(500).json({ success: false, error: error.message });
            }
        } else {
            return res.status(400).json({
                success: false,
                message: "Either 'specificationId' or 'bulk' with 'specifications' is required"
            });
        }

        res.json({
            success: true,
            message: bulk ? 'Batch verification completed' : 'Specification verified',
            results: bulk ? results : undefined
        });

    } catch (error) {
        console.error('Error in verifySpecification:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// Reject Specification
const rejectSpecification = async (req, res) => {
    try {
        const { itemCodeId, specificationId, bulk, specifications, remarks } = req.body;
        
        if (!remarks) {
            return res.status(400).json({ 
                success: false,
                message: "Remarks required" 
            });
        }

        const results = { success: [], errors: [] };

        if (bulk && specifications && Array.isArray(specifications)) {
            // Bulk rejection
            for (const spec of specifications) {
                try {
                    // Make sure we have the required ID
                    if (!spec.specificationId) {
                        throw new Error('Missing specification ID');
                    }

                    const result = await specificationWorkflow.rejectEntity(
                        spec.specificationId,
                        req.user,
                        remarks
                    );

                    results.success.push({ 
                        specificationId: spec.specificationId, 
                        itemCodeId: spec.itemCodeId,
                        fullCode: result.data?.fullCode || 'Unknown' 
                    });
                } catch (error) {
                    console.error('Error rejecting specification:', error);
                    results.errors.push({ 
                        specificationId: spec.specificationId, 
                        itemCodeId: spec.itemCodeId,
                        error: error.message 
                    });
                }
            }
        } else if (specificationId) {
            // Single rejection
            try {
                const result = await specificationWorkflow.rejectEntity(
                    specificationId,
                    req.user,
                    remarks
                );
                return res.json({ success: true, data: result });
            } catch (error) {
                return res.status(500).json({ success: false, error: error.message });
            }
        } else {
            return res.status(400).json({
                success: false,
                message: "Either 'specificationId' or 'bulk' with 'specifications' is required"
            });
        }

        res.json({
            success: true,
            message: bulk ? 'Batch rejection completed' : 'Specification rejected',
            results: bulk ? results : undefined
        });

    } catch (error) {
        console.error('Error in rejectSpecification:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

const getAllBaseCodes = async (req, res) => {
    try {
        const baseCodes = await ItemCode.find(
            { status: 'Approved', active: true },
            'baseCode itemName type categoryCode majorGroupCode dcaCode subDcaCode primaryUnit'
        ).sort({ baseCode: 1 });

        res.json({
            success: true,
            message: 'Base codes retrieved successfully',
            data: baseCodes
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get Base Code by ID with full details
const getBaseCodeById = async (req, res) => {
    try {
        const baseCode = await ItemCode.findById(req.params.id)
            .populate('hsnSac', 'code description')
            .populate('specifications.primaryUnit', 'symbol name')
            .populate('specifications.allowedUnits.unit', 'symbol name');

        if (!baseCode) {
            return res.status(404).json({
                success: false,
                message: 'Base code not found'
            });
        }

        res.json({
            success: true,
            message: 'Base code retrieved successfully',
            data: baseCode
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get all specifications for a base code
const getSpecificationsByBaseCode = async (req, res) => {
    try {
        const { baseCodeId } = req.params;
        const baseCode = await ItemCode.findById(baseCodeId)
            .populate('specifications.primaryUnit', 'symbol name')
            .select('baseCode itemName specifications');

        if (!baseCode) {
            return res.status(404).json({
                success: false,
                message: 'Base code not found'
            });
        }

        // Filter only approved specifications
        const approvedSpecs = baseCode.specifications.filter(
            spec => spec.status === 'Approved' && spec.active
        );

        res.json({
            success: true,
            message: 'Specifications retrieved successfully',
            data: {
                baseCode: baseCode.baseCode,
                itemName: baseCode.itemName,
                specifications: approvedSpecs
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get all item codes (full codes)
const getAllItemCodes = async (req, res) => {
    try {
        const itemCodes = await ItemCode.find(
            { status: 'Approved', active: true },
            'baseCode itemName specifications'
        ).populate('specifications.primaryUnit', 'symbol');

        const formattedCodes = itemCodes.reduce((acc, item) => {
            const approvedSpecs = item.specifications.filter(
                spec => spec.status === 'Approved' && spec.active
            );
            
            approvedSpecs.forEach(spec => {
                acc.push({
                    fullCode: spec.fullCode,
                    baseCode: item.baseCode,
                    itemName: item.itemName,
                    make: spec.make,
                    specification: spec.specification,
                    primaryUnit: spec.primaryUnit.symbol
                });
            });
            
            return acc;
        }, []);

        res.json({
            success: true,
            message: 'Item codes retrieved successfully',
            data: formattedCodes
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Search item codes for indent creation
const searchItemCodes = async (req, res) => {
    try {
        const { query, baseCode, make } = req.query;
        let searchQuery = { status: 'Approved', active: true };
        let specificationMatch = {};

        // If full item code is provided
        if (query) {
            const searchRegex = new RegExp(query, 'i');
            searchQuery = {
                $or: [
                    { 'specifications.fullCode': searchRegex },
                    { baseCode: searchRegex },
                    { itemName: searchRegex }
                ],
                status: 'Approved',
                active: true
            };
        }

        // If base code is provided, filter by it
        if (baseCode) {
            searchQuery.baseCode = baseCode;
        }

        // If make is provided, filter specifications by it
        if (make) {
            specificationMatch.make = make;
        }

        const itemCodes = await ItemCode.aggregate([
            { $match: searchQuery },
            { $unwind: '$specifications' },
            { 
                $match: {
                    'specifications.status': 'Approved',
                    'specifications.active': true,
                    ...specificationMatch
                }
            },
            {
                $lookup: {
                    from: 'units',
                    localField: 'specifications.primaryUnit',
                    foreignField: '_id',
                    as: 'unitInfo'
                }
            },
            {
                $project: {
                    fullCode: '$specifications.fullCode',
                    baseCode: 1,
                    itemName: 1,
                    make: '$specifications.make',
                    specification: '$specifications.specification',
                    primaryUnit: { $arrayElemAt: ['$unitInfo.symbol', 0] },
                    standardPrice: '$specifications.standardPrice'
                }
            },
            { $sort: { fullCode: 1 } }
        ]);

        // If base code is provided but make isn't, get unique makes for dropdown
        if (baseCode && !make) {
            const uniqueMakes = [...new Set(itemCodes.map(item => item.make))];
            return res.json({
                success: true,
                message: 'Makes retrieved successfully',
                makes: uniqueMakes,
                data: itemCodes
            });
        }

        res.json({
            success: true,
            message: 'Item codes retrieved successfully',
            data: itemCodes
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
const getDCACodesForItemCode = async (req, res) => {
    try {
        const { itemType } = req.query; // This will be either 'Material' or 'Service'

        if (!itemType) {
            return res.status(400).json({
                success: false,
                message: 'Item type is required'
            });
        }

        const itemTypeRegex = new RegExp(`^${itemType}$`, 'i');
        const query = {
            isActive: true,
            applicableForItemCode: true,
            itemCodeType: itemTypeRegex
        };
       

        const dcaCodes = await DCA.find(query)
        .select('code name')
        .sort('code');

        

        res.json({
            success: true,
            message: 'DCA codes retrieved successfully',
            data: dcaCodes
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get SubDCA codes for a specific DCA
const getSubDCACodesForDCA = async (req, res) => {
    try {
        const { dcaCode } = req.query;

        if (!dcaCode) {
            return res.status(400).json({
                success: false,
                message: 'DCA code is required'
            });
        }

        // Get all SubDCAs for this DCA
        const subDcaCodes = await SubDCA.find({
            dcaCode: dcaCode
        })
        .select('subCode subdcaName')  // using correct field names from your schema
        .sort('subCode');

       
        res.json({
            success: true,
            message: 'SubDCA codes retrieved successfully',
            data: subDcaCodes
        });

    } catch (error) {
        console.error('Error in getSubDCACodesForDCA:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};



module.exports = {
    createBaseCode,
    getBaseCodesForVerification,
    verifyBaseCode,
    rejectBaseCode,
    createSpecification,
    getSpecificationsForVerification,
    verifySpecification,
    rejectSpecification,
    getAllBaseCodes,
    getBaseCodeById,
    getSpecificationsByBaseCode,
    getAllItemCodes,
    searchItemCodes,
    getDCACodesForItemCode,
    getSubDCACodesForDCA
   
};