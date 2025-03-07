const mongoose = require('mongoose');
const MaterialRequisition = require('../models/materialRequisition');
const WorkflowService = require('../../controllers/workflowService');
const DCABudget = require('../../models/dcaBudgetModel');
const ItemCode = require('../models/ItemCode');
const SpecificationCode = require('../models/SpecificationCode');


const materialRequisitionWorkflow = new WorkflowService({
    workflowId: 201, // Assign appropriate workflow ID for material requisitions
    Model: MaterialRequisition,
    entityType: 'Material Requisition',
    isCostCentreApplicable: true,
    costCentreIdField: 'costCenter',
    costCentreTypeField: 'costCenterType',
    getNotificationMessage: (entity, action) => {
        switch(action) {
            case 'created':
                return `New Material Requisition Created: ${entity.requestNo}`;
            case 'nextLevel':
                return `Material Requisition ${entity.requestNo} moved to next level of verification`;
            case 'approved':
                return `Material Requisition ${entity.requestNo} has been approved`;
            case 'rejected':
                return `Material Requisition ${entity.requestNo} has been rejected`;
            default:
                return `Material Requisition ${entity.requestNo} ${action}`;
        }
    }
});

/**
 * Generate unique request number for material requisition
 * Format: Cost Centre Number + FY + Serial Number
 */
const generateRequestNumber = async (costCentreNo) => {
    try {
        // Get current fiscal year
        const today = new Date();
        let fiscalYear;
        if (today.getMonth() >= 3) { // April onwards
            fiscalYear = `${today.getFullYear()}-${(today.getFullYear() + 1).toString().substr(2)}`;
        } else {
            fiscalYear = `${today.getFullYear() - 1}-${today.getFullYear().toString().substr(2)}`;
        }
        
        // Get count of requisitions for this cost center in this fiscal year
        const startDate = new Date(fiscalYear.split('-')[0], 3, 1); // April 1st
        const endDate = new Date(parseInt(fiscalYear.split('-')[0]) + 1, 2, 31); // March 31st next year
        
        const count = await MaterialRequisition.countDocuments({
            costCentreNo: costCentreNo,
            requestDate: { $gte: startDate, $lte: endDate }
        });
        
        // Format: CC-193/2024-25/1
        const serialNumber = count + 1;
        
        // Create request number
        const requestNo = `${costCentreNo}/${fiscalYear}/${serialNumber}`;
        
        return requestNo;
    } catch (error) {
        console.error('Error generating request number:', error);
        throw new Error('Failed to generate request number');
    }
};

/**
 * Check and update DCA budget for material requisition
 */
const checkAndUpdateDCABudget = async (costCentreNo, items) => {
    try {
        // Group items by DCA code and calculate total amount for each DCA
        const dcaAmounts = {};
        
        items.forEach(item => {
            const dcaCode = item.dcaCode;
            if (!dcaAmounts[dcaCode]) {
                dcaAmounts[dcaCode] = 0;
            }
            dcaAmounts[dcaCode] += item.amount;
        });
        
        // Check budget availability for each DCA
        const dcaUpdates = [];
        
        for (const [dcaCode, requiredAmount] of Object.entries(dcaAmounts)) {
            // Find DCA budget for this cost center
            const dcaBudget = await DCABudget.findOne({
                ccNo: costCentreNo,
                dcaCode: dcaCode,
                status: 'Approved'
            });
            
            if (!dcaBudget) {
                throw new Error(`No approved budget found for ${dcaCode} in ${costCentreNo}`);
            }
            
            // Check if sufficient budget is available
            if (dcaBudget.balanceBudget < requiredAmount) {
                throw new Error(`Insufficient budget for ${dcaCode}. Required: ${requiredAmount}, Available: ${dcaBudget.balanceBudget}`);
            }
            
            // Prepare update (will be executed later if all checks pass)
            dcaUpdates.push({
                dcaBudget,
                requiredAmount
            });
        }
        
        // If all checks pass, update all DCA budgets
        for (const update of dcaUpdates) {
            update.dcaBudget.consumedBudget += update.requiredAmount;
            update.dcaBudget.balanceBudget -= update.requiredAmount;
            await update.dcaBudget.save();
        }
        
        return true;
    } catch (error) {
        console.error('Budget check error:', error);
        throw error;
    }
};

/**
 * Create a new material requisition
 */
const createMaterialRequisition = async (req, res) => {
    try {
        const {
            batchId,
            costCenter,
            costCenterType,
            costCentreNo, // CC-193 format
            items,
            remarks
        } = req.body;
        
        // Validate required fields
        if (!costCentreNo || !items || !items.length) {
            return res.status(400).json({
                success: false,
                message: 'Cost centre and items are required'
            });
        }
        
        // Process items - calculate amounts and set balance quantities
        const processedItems = items.map(item => ({
            ...item,
            amount: item.quantity * item.basicPrice,
            balanceQuantity: item.quantity,
            fulfillmentStatus: 'Pending'
        }));
        
        // Check DCA budget availability and update if sufficient
        try {
            await checkAndUpdateDCABudget(costCentreNo, processedItems);
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
        
        // Generate request number
        const requestNo = await generateRequestNumber(costCentreNo);
        
        // Calculate total amount
        const totalAmount = processedItems.reduce((sum, item) => sum + item.amount, 0);
        
        // Prepare material requisition data
        const requisitionData = {
            batchId,
            requestNo,
            requestDate: new Date(),
            costCenter, // ObjectId reference
            costCenterType, // For workflow routing
            costCentreNo, // String representation (CC-193)
            items: processedItems,
            totalAmount,
            status: 'Verification',
            levelId: 1,
            requestStatus: 'Draft'
        };
        
        // Create requisition through workflow
        const { entity: requisition } = await materialRequisitionWorkflow.createEntity(
            requisitionData,
            req.user,
            remarks || 'Material Requisition Created'
        );
        
        // Fetch the saved requisition with all details
        const savedRequisition = await MaterialRequisition.findById(requisition._id)
            .populate('costCenter', 'code name')
            .populate('items.unit', 'symbol name')
            .populate('items.originalUnit', 'symbol name');
        
        res.status(201).json({
            success: true,
            message: 'Material Requisition created successfully and sent for verification',
            data: savedRequisition
        });
        
    } catch (error) {
        console.error('Material Requisition creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create Material Requisition',
            error: error.message
        });
    }
};

/**
 * Get material requisitions for verification
 */
const getMaterialRequisitionsForVerification = async (req, res) => {
    try {
        const userRoleId = parseInt(req.query.userRoleId);
        const userId = req.query.userId || req.user._id;
        const { type } = req.query; // Add 'type' parameter to check if we need batch grouping
        
        if (isNaN(userRoleId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid userRoleId provided'
            });
        }
        
        const result = await materialRequisitionWorkflow.getEntitiesForVerification(userRoleId, userId);
        
        // Handle batch grouping if requested
        if (type === 'batch') {
            // Group requisitions by batchId
            const batchGroups = result.data.reduce((acc, requisition) => {
                if (requisition.batchId) {
                    // Check if we already have this batch
                    const existingBatch = acc.find(group => group.batchId === requisition.batchId);
                    
                    if (existingBatch) {
                        // Add to existing batch
                        existingBatch.requisitions.push(requisition);
                    } else {
                        // Create new batch
                        acc.push({
                            batchId: requisition.batchId,
                            createdAt: requisition.createdAt,
                            costCentreNo: requisition.costCentreNo,
                            requisitions: [requisition]
                        });
                    }
                } else {
                    // Handle individual requisitions (no batchId)
                    acc.push({
                        batchId: null,
                        requisitions: [requisition]
                    });
                }
                
                return acc;
            }, []);
            
            return res.json({
                success: true,
                message: 'Material Requisitions retrieved and grouped by batch',
                batchGroups
            });
        }
        
        // Return individual requisitions if batch grouping not requested
        res.json({
            success: true,
            message: 'Material Requisitions retrieved successfully',
            requisitions: result.data
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch material requisitions for verification',
            error: error.message
        });
    }
};

/**
 * Update material requisition status (approve/move to next level)
 */
const updateMaterialRequisitionStatus = async (req, res) => {
    try {
        const { id, batchId } = req.params; // Accept either id or batchId
        const { remarks } = req.body;
        
        if (!remarks) {
            return res.status(400).json({
                message: "Remarks are required for verification"
            });
        }
        
        // Handle batch verification
        if (batchId) {
            // Find all requisitions with this batchId
            const requisitions = await MaterialRequisition.find({ 
                batchId,
                status: 'Verification' // Only process items in verification status
            });
            
            if (requisitions.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No requisitions found for this batch'
                });
            }
            
            // Process all requisitions in batch
            const results = await Promise.all(
                requisitions.map(requisition => 
                    materialRequisitionWorkflow.verifyEntity(requisition._id, req.user, remarks)
                )
            );
            
            // Update requestStatus for all approved requisitions
            const approvedRequisitions = results
                .filter(result => result.data.status === 'Approved')
                .map(result => result.data._id);
                
            if (approvedRequisitions.length > 0) {
                await MaterialRequisition.updateMany(
                    { _id: { $in: approvedRequisitions } },
                    { requestStatus: 'Approved' }
                );
            }
            
            res.json({
                success: true,
                message: "Batch requisitions processed successfully",
                results
            });
        } else if (id) {
            // Process single requisition
            const result = await materialRequisitionWorkflow.verifyEntity(id, req.user, remarks);
            
            // If approved, update requestStatus
            if (result.data.status === 'Approved') {
                await MaterialRequisition.findByIdAndUpdate(id, {
                    requestStatus: 'Approved'
                });
            }
            
            res.json(result);
        } else {
            return res.status(400).json({
                success: false,
                message: 'Either id or batchId is required for verification'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update material requisition status',
            error: error.message
        });
    }
};

/**
 * Reject material requisition
 */
const rejectMaterialRequisition = async (req, res) => {
    try {
        const { id, batchId, remarks } = req.body;
        
        if (!remarks) {
            return res.status(400).json({
                success: false,
                message: "Remarks are required for rejection"
            });
        }
        
        if (!id && !batchId) {
            return res.status(400).json({
                success: false,
                message: 'Either Material Requisition ID or Batch ID is required for rejection'
            });
        }
        
        // Handle batch rejection
        if (batchId) {
            console.log('Attempting batch rejection:', batchId);
            
            // Find all requisitions with this batchId
            const requisitions = await MaterialRequisition.find({ 
                batchId,
                status: 'Verification' // Only process items in verification status
            });
            
            if (requisitions.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No requisitions found for this batch'
                });
            }
            
            const results = [];
            
            // Process each requisition in the batch
            for (const requisition of requisitions) {
                try {
                    // Reverse DCA budget consumption
                    if (requisition.status !== 'Rejected' && requisition.requestStatus !== 'Rejected') {
                        // Group items by DCA code
                        const dcaAmounts = {};
                        
                        requisition.items.forEach(item => {
                            const dcaCode = item.dcaCode;
                            if (!dcaAmounts[dcaCode]) {
                                dcaAmounts[dcaCode] = 0;
                            }
                            dcaAmounts[dcaCode] += item.amount;
                        });
                        
                        // Restore budget for each DCA
                        for (const [dcaCode, amount] of Object.entries(dcaAmounts)) {
                            const dcaBudget = await DCABudget.findOne({
                                ccNo: requisition.costCentreNo,
                                dcaCode: dcaCode,
                                status: 'Approved'
                            });
                            
                            if (dcaBudget) {
                                dcaBudget.consumedBudget -= amount;
                                dcaBudget.balanceBudget += amount;
                                await dcaBudget.save();
                            }
                        }
                    }
                    
                    // Reject the requisition through workflow
                    const result = await materialRequisitionWorkflow.rejectEntity(
                        requisition._id, 
                        req.user, 
                        remarks
                    );
                    
                    // Update requestStatus
                    await MaterialRequisition.findByIdAndUpdate(requisition._id, {
                        requestStatus: 'Rejected'
                    });
                    
                    results.push({
                        requestNo: requisition.requestNo,
                        success: true,
                        data: result
                    });
                } catch (error) {
                    results.push({
                        requestNo: requisition.requestNo,
                        success: false,
                        error: error.message
                    });
                }
            }
            
            return res.json({
                success: true,
                message: 'Batch requisitions rejected successfully',
                results
            });
        } else {
            // Single requisition rejection (keep existing code for single rejection)
            const requisition = await MaterialRequisition.findById(id);
            if (!requisition) {
                return res.status(404).json({
                    success: false,
                    message: 'Material Requisition not found'
                });
            }
            
            // Reverse DCA budget consumption (only if not already rejected)
            if (requisition.status !== 'Rejected' && requisition.requestStatus !== 'Rejected') {
                try {
                    // Group items by DCA code
                    const dcaAmounts = {};
                    
                    requisition.items.forEach(item => {
                        const dcaCode = item.dcaCode;
                        if (!dcaAmounts[dcaCode]) {
                            dcaAmounts[dcaCode] = 0;
                        }
                        dcaAmounts[dcaCode] += item.amount;
                    });
                    
                    // Restore budget for each DCA
                    for (const [dcaCode, amount] of Object.entries(dcaAmounts)) {
                        const dcaBudget = await DCABudget.findOne({
                            ccNo: requisition.costCentreNo,
                            dcaCode: dcaCode,
                            status: 'Approved'
                        });
                        
                        if (dcaBudget) {
                            dcaBudget.consumedBudget -= amount;
                            dcaBudget.balanceBudget += amount;
                            await dcaBudget.save();
                        }
                    }
                } catch (error) {
                    console.error('Error reversing budget consumption:', error);
                    // Continue with rejection even if budget reversal fails
                }
            }
            
            const result = await materialRequisitionWorkflow.rejectEntity(id, req.user, remarks);
            
            // Update requestStatus
            await MaterialRequisition.findByIdAndUpdate(id, {
                requestStatus: 'Rejected'
            });
            
            return res.json({
                success: true,
                message: 'Material Requisition rejected successfully',
                data: result
            });
        }
    } catch (error) {
        console.error('Controller error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to reject material requisition'
        });
    }
};

/**
 * Search for items by query (code or name) with optional filters
 */

// Search controller for material requisition

const searchItemsByCode = async (req, res) => {
    try {
        const { query, make, specification } = req.query;

        if (!query || query.trim().length < 3) {
            return res.status(400).json({
                success: false,
                message: 'Search query must be at least 3 characters'
            });
        }

        // Create a regex for case-insensitive search
        const searchRegex = new RegExp(query.trim(), 'i');
        
        // Build the primary search query for SpecificationCode collection
        const specQuery = {
            status: 'Approved',
            active: true,
            $or: [
                { fullCode: searchRegex }, // Search by full code
                { baseCode: searchRegex }  // Search by base code
            ]
        };
        
        // Add make and specification filters if provided
        if (make && make.trim()) {
            specQuery.make = new RegExp(make.trim(), 'i');
        }
        
        if (specification && specification.trim()) {
            specQuery.specification = new RegExp(specification.trim(), 'i');
        }
        
        // Search starting from SpecificationCode
        const results = await SpecificationCode.aggregate([
            // First match in SpecificationCode collection
            { $match: specQuery },
            
            // Lookup to get ItemCode details
            {
                $lookup: {
                    from: 'itemcodes',
                    localField: 'baseCodeId',
                    foreignField: '_id',
                    as: 'itemCodeInfo'
                }
            },
            
            // Lookup to get unit information
            {
                $lookup: {
                    from: 'units',
                    localField: 'primaryUnit',
                    foreignField: '_id',
                    as: 'unitInfo'
                }
            },
            
            // Lookup to get all allowed units
            {
                $lookup: {
                    from: 'units',
                    let: { allowedUnitsArray: "$allowedUnits.unit" },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { $in: ["$_id", "$$allowedUnitsArray"] } 
                            } 
                        }
                    ],
                    as: 'allowedUnitsInfo'
                }
            },
            
            // Project only the fields we need
            {
                $project: {
                    _id: 1,
                    id: '$_id', // For frontend compatibility
                    baseCodeId: 1,
                    baseCode: 1,
                    fullCode: 1,
                    itemName: { $arrayElemAt: ['$itemCodeInfo.itemName', 0] },
                    make: 1,
                    specification: 1,
                    dcaCode: { $arrayElemAt: ['$itemCodeInfo.dcaCode', 0] },
                    subDcaCode: { $arrayElemAt: ['$itemCodeInfo.subDcaCode', 0] },
                    primaryUnit: 1,
                    unitSymbol: { $arrayElemAt: ['$unitInfo.symbol', 0] },
                    unitName: { $arrayElemAt: ['$unitInfo.name', 0] },
                    standardPrice: 1,
                    basePrice: '$standardPrice', // Alias for frontend compatibility
                    allowedUnits: {
                        $map: {
                            input: '$allowedUnitsInfo',
                            as: 'unit',
                            in: {
                                _id: '$$unit._id',
                                symbol: '$$unit.symbol',
                                name: '$$unit.name',
                                conversionFactor: {
                                    $let: {
                                        vars: {
                                            unitAllowedData: {
                                                $arrayElemAt: [
                                                    {
                                                        $filter: {
                                                            input: '$allowedUnits',
                                                            as: 'au',
                                                            cond: { $eq: ['$$au.unit', '$$unit._id'] }
                                                        }
                                                    },
                                                    0
                                                ]
                                            }
                                        },
                                        in: '$$unitAllowedData.conversionFactor'
                                    }
                                }
                            }
                        }
                    }
                }
            },
            
            // Sort by code for readability
            { $sort: { fullCode: 1 } },
            
            // Limit results for performance
            { $limit: 50 }
        ]);

        // Extract unique makes for filtering
        const uniqueMakes = [...new Set(results.map(item => item.make).filter(Boolean))];

        res.json({
            success: true,
            message: 'Items retrieved successfully',
            data: results,
            makes: uniqueMakes
        });
    } catch (error) {
        console.error('Search items by code error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search items by code',
            error: error.message
        });
    }
};

const searchItemsByName = async (req, res) => {
    try {
        const { query, make, specification } = req.query;

        if (!query || query.trim().length < 3) {
            return res.status(400).json({
                success: false,
                message: 'Search query must be at least 3 characters'
            });
        }

        // Create a regex for case-insensitive search
        const searchRegex = new RegExp(query.trim(), 'i');
        
        // First search in ItemCode collection by name
        const results = await ItemCode.aggregate([
            // First match in ItemCode collection by name
            { 
                $match: {
                    itemName: searchRegex,
                    status: 'Approved',
                    active: true
                } 
            },
            
            // Lookup to get specification codes
            {
                $lookup: {
                    from: 'specificationcodes',
                    let: { baseCodeId: '$_id' },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $and: [
                                        { $eq: ['$baseCodeId', '$$baseCodeId'] },
                                        { $eq: ['$status', 'Approved'] },
                                        { $eq: ['$active', true] }
                                    ]
                                }
                            } 
                        },
                        // Apply make and specification filters if provided
                        ...(make && make.trim() ? [{ 
                            $match: { make: new RegExp(make.trim(), 'i') } 
                        }] : []),
                        ...(specification && specification.trim() ? [{ 
                            $match: { specification: new RegExp(specification.trim(), 'i') } 
                        }] : [])
                    ],
                    as: 'specifications'
                }
            },
            
            // Unwind the specifications to get one document per specification
            { $unwind: '$specifications' },
            
            // Lookup to get unit information
            {
                $lookup: {
                    from: 'units',
                    localField: 'specifications.primaryUnit',
                    foreignField: '_id',
                    as: 'unitInfo'
                }
            },
            
            // Lookup to get all allowed units
            {
                $lookup: {
                    from: 'units',
                    let: { allowedUnitsArray: "$specifications.allowedUnits.unit" },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { $in: ["$_id", "$$allowedUnitsArray"] } 
                            } 
                        }
                    ],
                    as: 'allowedUnitsInfo'
                }
            },
            
            // Project the fields we need
            {
                $project: {
                    _id: '$specifications._id',
                    id: '$specifications._id', // For frontend compatibility
                    baseCodeId: '$_id',
                    baseCode: '$specifications.baseCode',
                    fullCode: '$specifications.fullCode',
                    itemName: '$itemName',
                    make: '$specifications.make',
                    specification: '$specifications.specification',
                    dcaCode: '$dcaCode',
                    subDcaCode: '$subDcaCode',
                    primaryUnit: '$specifications.primaryUnit',
                    unitSymbol: { $arrayElemAt: ['$unitInfo.symbol', 0] },
                    unitName: { $arrayElemAt: ['$unitInfo.name', 0] },
                    standardPrice: '$specifications.standardPrice',
                    basePrice: '$specifications.standardPrice', // Alias for frontend compatibility
                    allowedUnits: {
                        $map: {
                            input: '$allowedUnitsInfo',
                            as: 'unit',
                            in: {
                                _id: '$$unit._id',
                                symbol: '$$unit.symbol',
                                name: '$$unit.name',
                                conversionFactor: {
                                    $let: {
                                        vars: {
                                            unitAllowedData: {
                                                $arrayElemAt: [
                                                    {
                                                        $filter: {
                                                            input: '$specifications.allowedUnits',
                                                            as: 'au',
                                                            cond: { $eq: ['$$au.unit', '$$unit._id'] }
                                                        }
                                                    },
                                                    0
                                                ]
                                            }
                                        },
                                        in: '$$unitAllowedData.conversionFactor'
                                    }
                                }
                            }
                        }
                    }
                }
            },
            
            // Sort by name and code
            { $sort: { itemName: 1, fullCode: 1 } },
            
            // Limit results
            { $limit: 50 }
        ]);

        // Extract unique makes for filtering
        const uniqueMakes = [...new Set(results.map(item => item.make).filter(Boolean))];

        res.json({
            success: true,
            message: 'Items retrieved successfully',
            data: results,
            makes: uniqueMakes
        });
    } catch (error) {
        console.error('Search items by name error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search items by name',
            error: error.message
        });
    }
};

// Combined search handler that routes to the appropriate search method
const searchItemsByQuery = async (req, res) => {
    const { searchMode } = req.query;
    
    // Default to code search if searchMode not specified
    if (!searchMode || searchMode === 'code') {
        return searchItemsByCode(req, res);
    } else if (searchMode === 'name') {
        return searchItemsByName(req, res);
    } else {
        // Invalid search mode
        return res.status(400).json({
            success: false,
            message: 'Invalid search mode. Use "code" or "name".'
        });
    }
};


module.exports = {
    createMaterialRequisition,
    getMaterialRequisitionsForVerification,
    updateMaterialRequisitionStatus,
    rejectMaterialRequisition,
    searchItemsByQuery 
};

