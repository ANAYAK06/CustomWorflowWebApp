
const ItemCode = require('../models/ItemCode');
const { MATERIAL_CATEGORIES, MATERIAL_MAJOR_GROUPS } = require('../constants/materialConstants') ;
const { SERVICE_CATEGORIES, SERVICE_MAJOR_GROUPS } = require('../constants/serviceConstants')


class CodeGenerationService {
    static async generateNextCode(type, categoryCode, majorGroupCode) {
        try {
            // Find the latest code for this category and major group combination
            const latestCode = await ItemCode.findOne({
                type,
                categoryCode,
                majorGroupCode,
                status: { $ne: 'Rejected' } // Exclude rejected codes
            }).sort({ nameCode: -1 });

            let nextNameCode = '01';
            if (latestCode) {
                const currentNumber = parseInt(latestCode.nameCode);
                nextNameCode = (currentNumber + 1).toString().padStart(2, '0');
            }

            const baseCode = `${categoryCode}${majorGroupCode}${nextNameCode}`;
            return { nameCode: nextNameCode, baseCode };
        } catch (error) {
            throw new Error(`Failed to generate code: ${error.message}`);
        }
    }

    static validateCodeCombination(type, categoryCode, majorGroupCode) {
        if (type === 'MATERIAL') {
            const validCategory = MATERIAL_CATEGORIES.some(cat => cat.code === categoryCode);
            const validMajorGroup = MATERIAL_MAJOR_GROUPS.some(group => group.code === majorGroupCode);
            
            if (!validCategory || !validMajorGroup) {
                throw new Error('Invalid material category or major group code');
            }
        } else if (type === 'SERVICE') {
            const validCategory = SERVICE_CATEGORIES.some(cat => cat.code === categoryCode);
            const validMajorGroup = SERVICE_MAJOR_GROUPS.some(group => group.code === majorGroupCode);
            
            if (!validCategory || !validMajorGroup) {
                throw new Error('Invalid service category or major group code');
            }
        }
    }
}

module.exports = CodeGenerationService;