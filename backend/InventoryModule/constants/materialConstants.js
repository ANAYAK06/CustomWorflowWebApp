const mongoose = require('mongoose');


const MATERIAL_CATEGORIES = [
    { code: '1', label: 'Asset', isAsset: true },
    { code: '2', label: 'Semi Consumables', isAsset: false },
    { code: '3', label: 'Consumables', isAsset: false },
    { code: '4', label: 'Raw Material', isAsset: false }
];

const MATERIAL_MAJOR_GROUPS = [
    { code: 'HT', label: 'Heavy Tools' },
    { code: 'ST', label: 'Small Tools' },
    { code: 'FF', label: 'Furniture And Fittings' },
    { code: 'OC', label: 'Other Consumables' },
    { code: 'ME', label: 'Machinery & Equipment' },
    { code: 'IT', label: 'IT Equipment' },
    { code: 'VE', label: 'Vehicles' },
    { code: 'RM', label: 'Raw materials' }
];

const ASSET_CATEGORIES = [
    'PLANT_MACHINERY',
    'VEHICLES',
    'OFFICE_EQUIPMENT',
    'IT_EQUIPMENT',
    'FURNITURE_FIXTURES',
    'OTHER'
];

module.exports = {
    MATERIAL_CATEGORIES,
    MATERIAL_MAJOR_GROUPS,
    ASSET_CATEGORIES
};