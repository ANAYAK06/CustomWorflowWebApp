const mongoose = require('mongoose');
const ItemCode = require('../models/ItemCode');

class SpecificationCodeGenerationService {
    static async generateNextSpecificationCode(baseCodeId) {
        try {
            // Find the base code first to ensure it exists
            const itemCode = await ItemCode.findById(baseCodeId);
            if (!itemCode) {
                throw new Error('Base code not found');
            }

            if (itemCode.status !== 'Approved') {
                throw new Error('Cannot generate specification code for unapproved base code');
            }

            // Find the latest specification code for this base code
            const latestSpec = await ItemCode.aggregate([
                { $match: { _id: itemCode._id } },
                { $unwind: '$specifications' },
                { 
                    $match: { 
                        'specifications.status': { $ne: 'Rejected' }  // Exclude rejected specifications
                    }
                },
                { $sort: { 'specifications.scode': -1 } },
                { $limit: 1 }
            ]);

            let nextSpecNumber = '001';
            if (latestSpec && latestSpec.length > 0) {
                const currentNumber = parseInt(latestSpec[0].specifications.scode);
                nextSpecNumber = (currentNumber + 1).toString().padStart(3, '0');
            }

            // Generate the full specification code
            const fullCode = `${itemCode.baseCode}${nextSpecNumber}`;

            return {
                scode: nextSpecNumber,
                fullCode,
                baseCode: itemCode.baseCode
            };
        } catch (error) {
            throw new Error(`Failed to generate specification code: ${error.message}`);
        }
    }

    static async generateBulkSpecificationCodes(baseCodeId, count) {
        try {
            // Find the base code
            const itemCode = await ItemCode.findById(baseCodeId);
            if (!itemCode) {
                throw new Error('Base code not found');
            }

            if (itemCode.status !== 'Approved') {
                throw new Error('Cannot generate specification codes for unapproved base code');
            }

            // Find the latest specification code
            const latestSpec = await ItemCode.aggregate([
                { $match: { _id: itemCode._id } },
                { $unwind: '$specifications' },
                { 
                    $match: { 
                        'specifications.status': { $ne: 'Rejected' }
                    }
                },
                { $sort: { 'specifications.scode': -1 } },
                { $limit: 1 }
            ]);

            let startNumber = 1;
            if (latestSpec && latestSpec.length > 0) {
                startNumber = parseInt(latestSpec[0].specifications.scode) + 1;
            }

            // Generate array of sequential codes
            const codes = [];
            for (let i = 0; i < count; i++) {
                const specNumber = (startNumber + i).toString().padStart(3, '0');
                codes.push({
                    scode: specNumber,
                    fullCode: `${itemCode.baseCode}${specNumber}`,
                    baseCode: itemCode.baseCode
                });
            }

            return codes;
        } catch (error) {
            throw new Error(`Failed to generate bulk specification codes: ${error.message}`);
        }
    }

    static validateSpecificationCode(scode) {
        // Validate specification code format
        if (!/^\d{3}$/.test(scode)) {
            throw new Error('Invalid specification code format. Must be 3 digits.');
        }
    }
}

module.exports = SpecificationCodeGenerationService;