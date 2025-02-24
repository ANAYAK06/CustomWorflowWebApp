const mongoose = require('mongoose');
const Unit = require('../models/unit');
const { UNIT_TYPES } = require('../constants/unitConstants');

class UnitConversionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnitConversionError';
    }
}

class UnitConversionService {
    static conversionCache = new Map();
    static baseUnits = new Map();

    // Initialize conversion cache and base units from database
    static async initializeCache() {
        try {
            // Clear existing caches
            UnitConversionService.conversionCache.clear();
            UnitConversionService.baseUnits.clear();

            // Get all active and approved units
            const units = await Unit.find({ 
                active: true,
                status: 'Approved'
            }).populate('conversions.toUnit');

            // Initialize base units from database
            const baseUnits = units.filter(unit => unit.baseUnit);
            baseUnits.forEach(unit => {
                UnitConversionService.baseUnits.set(unit.type, unit.symbol);
            });

            // Initialize conversion cache
            units.forEach(unit => {
                unit.conversions.forEach(conversion => {
                    if (conversion.toUnit) { // Check if toUnit is populated
                        const key = `${unit.symbol}-${conversion.toUnit.symbol}`;
                        UnitConversionService.conversionCache.set(key, conversion.factor);
                        
                        // Add reverse conversion
                        const reverseKey = `${conversion.toUnit.symbol}-${unit.symbol}`;
                        UnitConversionService.conversionCache.set(reverseKey, 1 / conversion.factor);
                    }
                });
            });
        } catch (error) {
            console.error('Cache initialization error:', error);
            throw new UnitConversionError('Failed to initialize conversion cache');
        }
    }

    // Enhanced unit type validation
    static validateUnitType(unitType) {
        if (!Object.values(UNIT_TYPES).includes(unitType)) {
            throw new UnitConversionError(`Invalid unit type: ${unitType}`);
        }
        return true;
    }

    // Get base unit for a type
    static getBaseUnit(unitType) {
        const baseUnit = UnitConversionService.baseUnits.get(unitType);
        if (!baseUnit) {
            throw new UnitConversionError(`No base unit defined for type: ${unitType}`);
        }
        return baseUnit;
    }

    // Validate if units are compatible for conversion
    static async validateUnitCompatibility(fromUnit, toUnit) {
        try {
            const [sourceUnit, targetUnit] = await Promise.all([
                Unit.findOne({ 
                    symbol: fromUnit, 
                    active: true,
                    status: 'Approved'
                }),
                Unit.findOne({ 
                    symbol: toUnit, 
                    active: true,
                    status: 'Approved'
                })
            ]);

            if (!sourceUnit || !targetUnit) {
                throw new UnitConversionError('Invalid or inactive unit symbols');
            }

            this.validateUnitType(sourceUnit.type);
            this.validateUnitType(targetUnit.type);

            if (sourceUnit.type !== targetUnit.type) {
                throw new UnitConversionError(
                    `Cannot convert between different unit types: ${sourceUnit.type} and ${targetUnit.type}`
                );
            }

            return { sourceUnit, targetUnit };
        } catch (error) {
            if (error instanceof UnitConversionError) throw error;
            throw new UnitConversionError('Failed to validate unit compatibility');
        }
    }

    // Enhanced find conversion path with base unit fallback
    static async findConversionPath(fromUnit, toUnit, visited = new Set()) {
        if (fromUnit === toUnit) return [fromUnit];
        
        visited.add(fromUnit);
        const directConversionKey = `${fromUnit}-${toUnit}`;
        
        // Check direct conversion
        if (UnitConversionService.conversionCache.has(directConversionKey)) {
            return [fromUnit, toUnit];
        }

        // Try conversion through base unit if available
        const unit = await Unit.findOne({ symbol: fromUnit });
        if (unit) {
            const baseUnit = this.getBaseUnit(unit.type);
            if (baseUnit && !visited.has(baseUnit)) {
                const toBaseKey = `${fromUnit}-${baseUnit}`;
                const fromBaseKey = `${baseUnit}-${toUnit}`;
                
                if (UnitConversionService.conversionCache.has(toBaseKey) && 
                    UnitConversionService.conversionCache.has(fromBaseKey)) {
                    return [fromUnit, baseUnit, toUnit];
                }
            }
        }

        // Try other conversion paths
        for (const [key] of UnitConversionService.conversionCache) {
            const [source, target] = key.split('-');
            if (source === fromUnit && !visited.has(target)) {
                const path = await this.findConversionPath(target, toUnit, visited);
                if (path) {
                    return [fromUnit, ...path];
                }
            }
        }

        return null;
    }

    // Convert value between units
    static async convert(value, fromUnit, toUnit) {
        try {
            if (fromUnit === toUnit) return value;

            await this.validateUnitCompatibility(fromUnit, toUnit);

            const conversionPath = await this.findConversionPath(fromUnit, toUnit);
            if (!conversionPath) {
                throw new UnitConversionError(`No conversion path found from ${fromUnit} to ${toUnit}`);
            }

            let result = value;
            for (let i = 0; i < conversionPath.length - 1; i++) {
                const currentUnit = conversionPath[i];
                const nextUnit = conversionPath[i + 1];
                const conversionKey = `${currentUnit}-${nextUnit}`;
                const factor = UnitConversionService.conversionCache.get(conversionKey);
                
                if (factor === undefined) {
                    throw new UnitConversionError(`Missing conversion factor for ${currentUnit} to ${nextUnit}`);
                }
                
                result *= factor;
            }

            return Number(result.toFixed(6));
        } catch (error) {
            console.error('Conversion error:', error);
            throw new UnitConversionError('Conversion failed');
        }
    }

    // Add new conversion factor
    static async addConversion(fromUnit, toUnit, factor) {
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const { sourceUnit, targetUnit } = await this.validateUnitCompatibility(fromUnit, toUnit);

                // Check if conversion already exists
                const existingConversion = sourceUnit.conversions.find(
                    conv => conv.toUnit.toString() === targetUnit._id.toString()
                );

                if (existingConversion) {
                    // Update existing conversion
                    await Unit.updateOne(
                        { 
                            _id: sourceUnit._id,
                            'conversions.toUnit': targetUnit._id
                        },
                        { 
                            $set: { 'conversions.$.factor': factor }
                        }
                    );

                    // Update reverse conversion
                    await Unit.updateOne(
                        {
                            _id: targetUnit._id,
                            'conversions.toUnit': sourceUnit._id
                        },
                        {
                            $set: { 'conversions.$.factor': 1 / factor }
                        }
                    );
                } else {
                    // Add new conversion
                    await Unit.findByIdAndUpdate(sourceUnit._id, {
                        $push: {
                            conversions: {
                                toUnit: targetUnit._id,
                                factor: factor
                            }
                        }
                    });

                    // Add reverse conversion
                    await Unit.findByIdAndUpdate(targetUnit._id, {
                        $push: {
                            conversions: {
                                toUnit: sourceUnit._id,
                                factor: 1 / factor
                            }
                        }
                    });
                }

                // Update cache
                UnitConversionService.conversionCache.set(`${fromUnit}-${toUnit}`, factor);
                UnitConversionService.conversionCache.set(`${toUnit}-${fromUnit}`, 1 / factor);
            });
        } catch (error) {
            console.error('Add conversion error:', error);
            throw new UnitConversionError('Failed to add conversion factor');
        } finally {
            await session.endSession();
        }
    }
}

module.exports = { UnitConversionService };