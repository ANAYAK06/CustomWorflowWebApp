// baseCodeController.js
const mongoose = require('mongoose');
const ItemCode = require('../models/ItemCode');
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
    Model: ItemCode,
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

    const hsnSac = await HsnSac.findById(data.hsnSac);
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
    let uploadedFiles = null;
    try {
        const isExcelUpload = req.body.isExcelUpload === 'true';
        if (isExcelUpload) {
            await new Promise((resolve, reject) => {
                multerConfig.upload(req, res, (err) => {
                    if (err) {
                        console.error('Multer upload error:', err);
                        reject(new Error('File upload failed'));
                    }
                    uploadedFiles = req.files;
                    resolve();
                });
            });

            if (!req.files?.excelFile?.[0]) {
                throw new Error('Excel file is required');
            }

            const remarks = req.body.remarks || 'Bulk upload';
            const workbook = XLSX.read(req.files.excelFile[0].buffer, { type: 'buffer' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(worksheet);

            const batchId = new mongoose.Types.ObjectId();
            const results = { success: [], errors: [] };

            for (const [index, row] of data.entries()) {
                try {
                    // Explicitly handle each field
                    const type = row['type']?.toString().trim();
                    const categoryCode = row['categoryCode']?.toString().trim();
                    const majorGroupCode = row['majorGroupCode']?.toString().trim()|| '';
                    const itemName = row['itemName']?.toString().trim() || '';
                    const primaryUnit = row['primaryUnit']?.toString().trim() || '';
                    const hsnSacCode = row['hsnSac']?.toString().trim() || '';
                    const dcaCode = row['dcaCode']?.toString().trim() || '';
                    const subDcaCode = row['subDcaCode']?.toString().trim() || '';
                    const isAsset = row['isAsset']?.toString().toLowerCase() === 'yes';

                    // Create base item object
                    const baseItem = {
                        type,
                        categoryCode,
                        majorGroupCode,
                        itemName,
                        primaryUnit,
                        hsnSac: hsnSacCode,
                        dcaCode,
                        subDcaCode,
                        isAsset,
                        status: 'Verification',
                        levelId: 1,
                        active: true,
                        uploadBatch: batchId,
                        remarks
                    };

                    // Generate code
                    const { nameCode, baseCode } = await CodeGenerationService.generateNextCode(
                        type,
                        categoryCode,
                        majorGroupCode
                    );

                    const processedItem = {
                        ...baseItem,
                        nameCode,
                        baseCode
                    };

                    // Handle asset category if needed
                    if (isAsset) {
                        const assetCategory = row['Asset Category']?.toString().trim() || '';
                        if (!assetCategory || !ASSET_CATEGORIES.includes(assetCategory)) {
                            throw new Error('Valid asset category is required for assets');
                        }
                        processedItem.assetCategory = assetCategory;
                    }

                    // Validate
                    await validateBaseCodeData(processedItem);

                    // Create through workflow
                    const result = await baseCodeWorkflow.createEntity(
                        processedItem,
                        req.user,
                        remarks
                    );

                    results.success.push({
                        rowIndex: index + 2,
                        itemName: processedItem.itemName,
                        baseCode: result.entity.baseCode
                    });
                } catch (error) {
                    results.errors.push({
                        rowIndex: index + 2,
                        itemName: row['Item Name'] || 'Unknown Item',
                        error: error.message
                    });
                }
            }

            if (uploadedFiles) {
                await cleanupFiles(uploadedFiles);
            }

            return res.status(results.errors.length ? 207 : 201).json({
                success: true,
                message: 'Base codes processed from Excel',
                data: {
                    batchId,
                    results
                }
            });
        } else {
            // Single item creation (unchanged)
            const data = req.body;
            
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
        if (uploadedFiles) {
            await cleanupFiles(uploadedFiles);
        }
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
    // Check if make+specification combination already exists
    const existingSpec = itemCode.specifications.find(
        spec => spec.make.toLowerCase() === data.make.toLowerCase() && 
               spec.specification.toLowerCase() === data.specification.toLowerCase()
    );
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
const createSpecification = async (req, res) => {
    try {
        const { itemCodeId } = req.params;
        const { specifications, bulkUpload } = req.body;

        const itemCode = await ItemCode.findById(itemCodeId);
        if (!itemCode) {
            return res.status(404).json({ 
                success: false, 
                message: 'Base code not found' 
            });
        }

        if (itemCode.status !== 'Approved') {
            return res.status(400).json({ 
                success: false,
                message: 'Cannot add specifications to unapproved base code' 
            });
        }

        const results = { success: [], errors: [] };
        
        // Process single specification
        const processSpecification = async (specData) => {
            try {
                await validateSpecificationData(itemCode, specData);
                
                const priceConversions = await calculatePriceConversions(
                    specData.primaryUnit,
                    specData.allowedUnits || [],
                    specData.standardPrice
                );
                  
                const savedItemCode = await itemCode.addSpecification({
                    ...specData,
                    status: 'Verification',
                    levelId: 1,
                    priceConversions
                });

                const newSpec = savedItemCode.specifications[savedItemCode.specifications.length - 1];
                
                
                await specificationWorkflow.createEntity(
                    itemCode,
                    req.user,
                    {
                        metadata: {
                            specificationId: newSpec._id
                        }
                    }
                );

                return newSpec;
            } catch (error) {
                throw new Error(`Error processing specification ${currentIndex + 1}: ${error.message}`);
            }
        };

        if (bulkUpload) {
            // Handle bulk specifications
            const specsToProcess = Array.isArray(specifications) ? specifications : [specifications];
            
            for (let i = 0; i < specsToProcess.length; i++) {
                try {
                    const result = await processSpecification(specsToProcess[i], i);
                    results.success.push({
                        make: specsToProcess[i].make,
                        specification: specsToProcess[i].specification,
                        fullCode: result.fullCode,
                        message: 'Successfully created'
                    });
                } catch (error) {
                    results.errors.push({
                        make: specsToProcess[i].make,
                        specification: specsToProcess[i].specification,
                        error: error.message
                    });
                }
            }

            return res.status(201).json({
                success: true,
                message: 'Bulk specifications processing completed',
                data: results
            });
        } else {
            // Handle single specification
            const result = await processSpecification(req.body, 0);
            return res.status(201).json({
                success: true,
                message: 'Specification created successfully',
                data: result
            });
        }

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to create specification(s)',
            error: error.message
        });
    }
};

// Get Specifications for Verification
const getSpecificationsForVerification = async (req, res) => {
    try {
        const userRoleId = parseInt(req.query.userRoleId);
        const { type } = req.query; // 'bulk' or 'single'

        if (isNaN(userRoleId)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid userRoleId provided' 
            });
        }

        const result = await specificationWorkflow.getEntitiesForVerification(userRoleId);
        
        // Group specifications by base code for bulk operations
        const specifications = result.data.reduce((acc, itemCode) => {
            const verificationSpecs = itemCode.specifications.filter(s => s.status === 'Verification');
            
            verificationSpecs.forEach(spec => {
                acc.push({
                    itemCodeId: itemCode._id,
                    baseCode: itemCode.baseCode,
                    itemName: itemCode.itemName,
                    specification: {
                        ...spec,
                        signatureAndRemarks: itemCode.signatureAndRemarks
                    }
                });
            });
            
            return acc;
        }, []);

        if (type === 'bulk') {
            // Group by base code for bulk operations
            const groupedSpecs = specifications.reduce((acc, spec) => {
                const baseCode = spec.baseCode;
                if (!acc[baseCode]) {
                    acc[baseCode] = [];
                }
                acc[baseCode].push(spec);
                return acc;
            }, {});

            return res.json({
                success: true,
                message: 'Grouped specifications retrieved for verification',
                specifications: groupedSpecs
            });
        }

        res.json({
            success: true,
            message: 'Specifications retrieved for verification',
            specifications
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Verify Specification
const verifySpecification = async (req, res) => {
    try {
        const { remarks, bulk, specifications } = req.body;
        const { itemCodeId, specificationId } = req.params;

        if (!remarks) {
            return res.status(400).json({
                success: false,
                message: "Remarks are required for verification"
            });
        }

        if (bulk && specifications) {
            // Handle bulk verification
            const results = { success: [], errors: [] };

            for (const spec of specifications) {
                try {
                    const result = await specificationWorkflow.verifyEntity(
                        spec.itemCodeId,
                        req.user,
                        remarks,
                        { specificationId: spec.specificationId }
                    );

                    results.success.push({
                        itemCodeId: spec.itemCodeId,
                        specificationId: spec.specificationId,
                        fullCode: result.data.fullCode,
                        message: 'Successfully verified'
                    });
                } catch (error) {
                    results.errors.push({
                        itemCodeId: spec.itemCodeId,
                        specificationId: spec.specificationId,
                        error: error.message
                    });
                }
            }

            return res.json({
                success: true,
                message: 'Bulk specification verification completed',
                data: results
            });
        } else {
            // Handle single verification
            const result = await specificationWorkflow.verifyEntity(
                itemCodeId,
                req.user,
                remarks,
                { specificationId }
            );

            return res.json({
                success: true,
                message: 'Specification verified successfully',
                data: result
            });
        }

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Reject Specification
const rejectSpecification = async (req, res) => {
    try {
        const { remarks, bulk, specifications } = req.body;
        const { itemCodeId, specificationId } = req.params;

        if (!remarks) {
            return res.status(400).json({
                success: false,
                message: "Remarks are required for rejection"
            });
        }

        if (bulk && specifications) {
            // Handle bulk rejection
            const results = { success: [], errors: [] };

            for (const spec of specifications) {
                try {
                    const result = await specificationWorkflow.rejectEntity(
                        spec.itemCodeId,
                        req.user,
                        remarks,
                        { 
                            specificationId: spec.specificationId,
                            specificField: 'status'
                        }
                    );

                    results.success.push({
                        itemCodeId: spec.itemCodeId,
                        specificationId: spec.specificationId,
                        fullCode: result.data.fullCode,
                        message: 'Successfully rejected'
                    });
                } catch (error) {
                    results.errors.push({
                        itemCodeId: spec.itemCodeId,
                        specificationId: spec.specificationId,
                        error: error.message
                    });
                }
            }

            return res.json({
                success: true,
                message: 'Bulk specification rejection completed',
                data: results
            });
        } else {
            // Handle single rejection
            const result = await specificationWorkflow.rejectEntity(
                itemCodeId,
                req.user,
                remarks,
                { 
                    specificationId,
                    specificField: 'status'
                }
            );

            return res.json({
                success: true,
                message: 'Specification rejected successfully',
                data: result
            });
        }

    } catch (error) {
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
            'baseCode itemName type categoryCode majorGroupCode'
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

// Add this function to properly transform Excel data
const transformExcelData = (item) => {
    return {
        type: item['Type']?.trim().toUpperCase(),
        categoryCode: item['Category Code']?.trim(),
        majorGroupCode: item['Major Group Code']?.trim(),
        itemName: item['Item Name']?.trim(),
        primaryUnit: item['Primary Unit']?.trim(),
        hsnSac: item['HSN/SAC Code']?.trim(),
        dcaCode: item['DCA Code']?.trim(),
        subDcaCode: item['Sub DCA Code']?.trim(),
        isAsset: item['Is Asset']?.toLowerCase() === 'yes'
    };
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