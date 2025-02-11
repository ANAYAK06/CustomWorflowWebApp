const mongoose = require('mongoose');
const Unit = require('../models/unit');
const { UnitConversionService } = require('../services/unitConversionService');

/**
 * Calculates price conversions for different units based on a standard price
 * @param {string} primaryUnit - Primary unit ID
 * @param {Array} allowedUnits - Array of allowed unit objects
 * @param {number} standardPrice - Standard price in primary unit
 * @returns {Promise<Array>} Array of price conversions
 */
const calculatePriceConversions = async (primaryUnit, allowedUnits, standardPrice) => {
    // Validate inputs
    if (!primaryUnit || !mongoose.Types.ObjectId.isValid(primaryUnit)) {
        throw new Error('Invalid primary unit ID');
    }
    
    if (!Array.isArray(allowedUnits)) {
        throw new Error('Allowed units must be an array');
    }

    if (!standardPrice || standardPrice <= 0) {
        throw new Error('Standard price must be a positive number');
    }

    // Get primary unit details
    const primaryUnitDoc = await Unit.findById(primaryUnit);
    if (!primaryUnitDoc) {
        throw new Error('Primary unit not found');
    }

    // Get all unit documents in one query for better performance
    const unitIds = allowedUnits.map(u => u.unit);
    const units = await Unit.find({ _id: { $in: unitIds } });

    // Create a map for quick lookup
    const unitMap = new Map(units.map(unit => [unit._id.toString(), unit]));

    const priceConversions = [];
    const errors = [];

    // Process each conversion
    await Promise.all(allowedUnits.map(async (unitData) => {
        try {
            const unit = unitMap.get(unitData.unit.toString());
            if (!unit) {
                throw new Error(`Unit not found: ${unitData.unit}`);
            }

            // Validate unit type compatibility
            if (unit.type !== primaryUnitDoc.type) {
                throw new Error(`Unit type mismatch: ${unit.symbol} (${unit.type}) is not compatible with ${primaryUnitDoc.symbol} (${primaryUnitDoc.type})`);
            }

            // Get conversion factor
            const conversionFactor = await UnitConversionService.convert(
                1,
                primaryUnitDoc.symbol,
                unit.symbol
            );

            // Calculate and validate price
            const rate = standardPrice * conversionFactor;
            if (!isFinite(rate)) {
                throw new Error(`Invalid conversion result for ${unit.symbol}`);
            }

            priceConversions.push({
                unit: unitData.unit,
                rate: Number(rate.toFixed(2)),
                conversionFactor: Number(conversionFactor.toFixed(6)),
                symbol: unit.symbol // Adding symbol for reference
            });

        } catch (error) {
            errors.push({
                unit: unitData.unit,
                error: error.message
            });
        }
    }));

    // If there were any errors, throw them all together
    if (errors.length > 0) {
        throw new Error('Price conversion errors: ' + 
            errors.map(e => `${e.unit}: ${e.error}`).join(', '));
    }

    return priceConversions;
};

// Additional utility function for single unit conversion
const calculateSingleUnitPrice = async (fromUnit, toUnit, price) => {
    try {
        const conversionFactor = await UnitConversionService.convert(1, fromUnit, toUnit);
        return Number((price * conversionFactor).toFixed(2));
    } catch (error) {
        throw new Error(`Failed to convert price from ${fromUnit} to ${toUnit}: ${error.message}`);
    }
};

module.exports = {
    calculatePriceConversions,
    calculateSingleUnitPrice
};