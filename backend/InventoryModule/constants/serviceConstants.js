const mongoose = require('mongoose');

const SERVICE_CATEGORIES = [
    { code: 'S1', label: 'Professional Services' },
    { code: 'S2', label: 'Construction Services' },
    { code: 'S3', label: 'Equipment Rental' },
    { code: 'S4', label: 'Installation Services' },
    { code: 'S5', label: 'Maintenance Services' }
];

const SERVICE_MAJOR_GROUPS = [
    { code: 'CS', label: 'Construction Services' },
    { code: 'PS', label: 'Professional Services' },
    { code: 'MS', label: 'Maintenance Services' },
    { code: 'TS', label: 'Technical Services' },
    { code: 'ER', label: 'Equipment Rental' }
];

module.exports = {
    SERVICE_CATEGORIES,
    SERVICE_MAJOR_GROUPS
};