// src/modules/inventory/services/itemCodeService.js
const mongoose = require('mongoose');

const  ItemCode  = require('../models/ItemCode') 
const { MATERIAL_CATEGORIES, MATERIAL_MAJOR_GROUPS } = require('../constants/materialConstants') ;
const { SERVICE_CATEGORIES, SERVICE_MAJOR_GROUPS } = require('../constants/serviceConstants')

class ItemCodeError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ItemCodeError';
    }
}

class ItemCodeService {
    // Generate a new item code
    static async generateItemCode(type, categoryCode, majorGroupCode, specificationCode) {
        try {
            // Get the last serial number for this combination
            const regex = new RegExp(`^${categoryCode}${majorGroupCode}${specificationCode}`);
            const lastItem = await ItemCode.findOne({ 
                itemCode: regex 
            }).sort({ itemCode: -1 });

            let serialNumber = '01';
            if (lastItem) {
                const currentSerial = parseInt(lastItem.itemCode.slice(-2));
                serialNumber = (currentSerial + 1).toString().padStart(2, '0');
                if (currentSerial >= 99) {
                    throw new ItemCodeError('Maximum serial number reached for this specification');
                }
            }

            return `${categoryCode}${majorGroupCode}${specificationCode}${serialNumber}`;
        } catch (error) {
            throw new ItemCodeError(`Failed to generate item code: ${error.message}`);
        }
    }

    // Validate item code data
    static validateItemCodeData(data) {
        const { type, categoryCode, majorGroupCode } = data;

        if (type === 'MATERIAL') {
            const validCategory = MATERIAL_CATEGORIES.some(cat => cat.code === categoryCode);
            const validMajorGroup = MATERIAL_MAJOR_GROUPS.some(group => group.code === majorGroupCode);
            
            if (!validCategory) throw new ItemCodeError('Invalid material category code');
            if (!validMajorGroup) throw new ItemCodeError('Invalid material major group code');
        } else if (type === 'SERVICE') {
            const validCategory = SERVICE_CATEGORIES.some(cat => cat.code === categoryCode);
            const validMajorGroup = SERVICE_MAJOR_GROUPS.some(group => group.code === majorGroupCode);
            
            if (!validCategory) throw new ItemCodeError('Invalid service category code');
            if (!validMajorGroup) throw new ItemCodeError('Invalid service major group code');
        } else {
            throw new ItemCodeError('Invalid item type');
        }
    }

    // Create new item code
    static async createItemCode(itemData) {
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                // Validate data
                this.validateItemCodeData(itemData);

                // Generate item code
                const generatedCode = await this.generateItemCode(
                    itemData.type,
                    itemData.categoryCode,
                    itemData.majorGroupCode,
                    itemData.specificationCode
                );

                // Create item code
                const itemCode = new ItemCode({
                    ...itemData,
                    itemCode: generatedCode,
                    isAsset: MATERIAL_CATEGORIES.find(cat => cat.code === itemData.categoryCode)?.isAsset || false
                });

                await itemCode.save({ session });
            });

            await session.endSession();
        } catch (error) {
            await session.endSession();
            throw new ItemCodeError(`Failed to create item code: ${error.message}`);
        }
    }

    // Update item code
    static async updateItemCode(itemCode, updateData) {
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const item = await ItemCode.findOne({ itemCode });
                if (!item) throw new ItemCodeError('Item code not found');

                // Don't allow changing type, category, or major group
                delete updateData.type;
                delete updateData.categoryCode;
                delete updateData.majorGroupCode;
                delete updateData.itemCode;

                Object.assign(item, updateData);
                await item.save({ session });
            });

            await session.endSession();
        } catch (error) {
            await session.endSession();
            throw new ItemCodeError(`Failed to update item code: ${error.message}`);
        }
    }

    // Get item code details
    static async getItemCodeDetails(itemCode) {
        try {
            const item = await ItemCode.findOne({ itemCode })
                .populate('primaryUnit')
                .populate('allowedUnits.unit')
                .populate('hsnSac');

            if (!item) throw new ItemCodeError('Item code not found');
            return item;
        } catch (error) {
            throw new ItemCodeError(`Failed to get item details: ${error.message}`);
        }
    }

    // Search item codes
    static async searchItemCodes(query) {
        try {
            const searchRegex = new RegExp(query, 'i');
            return await ItemCode.find({
                $or: [
                    { itemCode: searchRegex },
                    { itemName: searchRegex },
                    { specification: searchRegex }
                ]
            })
            .select('itemCode itemName specification type isAsset')
            .limit(10);
        } catch (error) {
            throw new ItemCodeError('Search failed');
        }
    }

    // Get items by category
    static async getItemsByCategory(categoryCode) {
        try {
            return await ItemCode.find({ 
                categoryCode,
                active: true 
            })
            .sort('itemCode');
        } catch (error) {
            throw new ItemCodeError('Failed to get items by category');
        }
    }

    // Deactivate item code
    static async deactivateItemCode(itemCode) {
        try {
            const result = await ItemCode.findOneAndUpdate(
                { itemCode },
                { active: false },
                { new: true }
            );
            if (!result) throw new ItemCodeError('Item code not found');
            return result;
        } catch (error) {
            throw new ItemCodeError(`Failed to deactivate item code: ${error.message}`);
        }
    }
}

// src/modules/inventory/services/serviceRateService.js


const ServiceRate = require('../models/ServiceRate')
const UnitConversionService = require ('./unitConversionService') ;

class ServiceRateError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ServiceRateError';
    }
}

class ServiceRateService {
    // Create new service rate
    static async createServiceRate(rateData) {
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                // Check for overlapping date ranges
                const overlapping = await ServiceRate.findOne({
                    itemCode: rateData.itemCode,
                    unit: rateData.unit,
                    $or: [
                        {
                            effectiveFrom: { $lte: rateData.effectiveFrom },
                            effectiveTo: { $gte: rateData.effectiveFrom }
                        },
                        {
                            effectiveFrom: { $lte: rateData.effectiveTo },
                            effectiveTo: { $gte: rateData.effectiveTo }
                        }
                    ]
                });

                if (overlapping) {
                    throw new ServiceRateError('Date range overlaps with existing rate');
                }

                const serviceRate = new ServiceRate(rateData);
                await serviceRate.save({ session });
            });

            await session.endSession();
        } catch (error) {
            await session.endSession();
            throw new ServiceRateError(`Failed to create service rate: ${error.message}`);
        }
    }

    // Get applicable rate for date
    static async getApplicableRate(itemCode, unit, date = new Date()) {
        try {
            const rate = await ServiceRate.findOne({
                itemCode,
                unit,
                effectiveFrom: { $lte: date },
                $or: [
                    { effectiveTo: { $gte: date } },
                    { effectiveTo: null }
                ],
                active: true
            });

            if (!rate) throw new ServiceRateError('No applicable rate found for the date');
            return rate;
        } catch (error) {
            throw new ServiceRateError(`Failed to get applicable rate: ${error.message}`);
        }
    }

    // Calculate service cost
    static async calculateServiceCost(itemCode, unit, quantity, date = new Date()) {
        try {
            const rate = await this.getApplicableRate(itemCode, unit, date);
            let cost = rate.rate * quantity;

            // Apply minimum charge if applicable
            if (rate.minimumCharge && cost < rate.minimumCharge) {
                cost = rate.minimumCharge;
            }

            // Validate minimum quantity
            if (rate.minimumQuantity && quantity < rate.minimumQuantity) {
                throw new ServiceRateError(`Minimum quantity required: ${rate.minimumQuantity} ${unit}`);
            }

            return {
                cost,
                rate: rate.rate,
                minimumCharge: rate.minimumCharge,
                conditions: rate.conditions
            };
        } catch (error) {
            throw new ServiceRateError(`Failed to calculate service cost: ${error.message}`);
        }
    }

    // Get rate history
    static async getRateHistory(itemCode, unit) {
        try {
            return await ServiceRate.find({
                itemCode,
                unit
            })
            .sort('-effectiveFrom');
        } catch (error) {
            throw new ServiceRateError('Failed to get rate history');
        }
    }

    // Update service rate
    static async updateServiceRate(rateId, updateData) {
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const rate = await ServiceRate.findById(rateId);
                if (!rate) throw new ServiceRateError('Rate not found');

                // Don't allow changing itemCode or unit
                delete updateData.itemCode;
                delete updateData.unit;

                Object.assign(rate, updateData);
                await rate.save({ session });
            });

            await session.endSession();
        } catch (error) {
            await session.endSession();
            throw new ServiceRateError(`Failed to update service rate: ${error.message}`);
        }
    }

    // Convert rate between units
    static async convertRate(rate, fromUnit, toUnit) {
        try {
            return await UnitConversionService.convertPrice(rate, fromUnit, toUnit);
        } catch (error) {
            throw new ServiceRateError(`Failed to convert rate: ${error.message}`);
        }
    }
}

class CodeGenerationService {
    static async generateNextNameCode(categoryCode, majorGroupCode) {
        try {
            // Find all existing codes for this category and major group combination
            const existingCodes = await ItemCode.find({
                categoryCode,
                majorGroupCode,
                status: { $ne: 'Rejected' } // Exclude rejected codes
            }).sort({ nameCode: -1 }); // Sort in descending order to get the latest code

            if (!existingCodes.length) {
                return '01'; // Start with 01 if no existing codes
            }

            // Get the highest existing name code
            const lastNameCode = existingCodes[0].nameCode;
            
            // Convert to number and increment
            const nextNumber = parseInt(lastNameCode, 10) + 1;
            
            // Pad with leading zero and ensure 2 digits
            return nextNumber.toString().padStart(2, '0');
        } catch (error) {
            throw new Error(`Failed to generate name code: ${error.message}`);
        }
    }

    static async generateBaseCode(categoryCode, majorGroupCode) {
        try {
            const nameCode = await this.generateNextNameCode(categoryCode, majorGroupCode);
            return `${categoryCode}${majorGroupCode}${nameCode}`;
        } catch (error) {
            throw new Error(`Failed to generate base code: ${error.message}`);
        }
    }

    static async validateCodeGeneration(type, categoryCode, majorGroupCode) {
        // Validate material categories and major groups
        if (type === 'MATERIAL') {
            const validCategory = MATERIAL_CATEGORIES.some(cat => cat.code === categoryCode);
            const validMajorGroup = MATERIAL_MAJOR_GROUPS.some(group => group.code === majorGroupCode);
            
            if (!validCategory || !validMajorGroup) {
                throw new Error('Invalid category or major group code for material');
            }
        }
        // Validate service categories and major groups
        else if (type === 'SERVICE') {
            const validCategory = SERVICE_CATEGORIES.some(cat => cat.code === categoryCode);
            const validMajorGroup = SERVICE_MAJOR_GROUPS.some(group => group.code === majorGroupCode);
            
            if (!validCategory || !validMajorGroup) {
                throw new Error('Invalid category or major group code for service');
            }
        }
    }
}


module.exports = {
    ItemCodeService,
    ServiceRateService,
    CodeGenerationService
}