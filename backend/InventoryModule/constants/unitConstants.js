const mongoose = require('mongoose');

const  UNIT_TYPES = {
    WEIGHT: 'WEIGHT',
    LENGTH: 'LENGTH',
    VOLUME: 'VOLUME',
    QUANTITY: 'QUANTITY',
    AREA: 'AREA',
    TIME: 'TIME',
    LUMPSUM: 'LUMPSUM'
};

 const MATERIAL_UNITS = [
    { symbol: 'PCS', name: 'Pieces', type: UNIT_TYPES.QUANTITY },
    { symbol: 'KG', name: 'Kilogram', type: UNIT_TYPES.WEIGHT, isBase: true },
    { symbol: 'MT', name: 'Metric Ton', type: UNIT_TYPES.WEIGHT },
    { symbol: 'MTR', name: 'Meter', type: UNIT_TYPES.LENGTH, isBase: true },
    { symbol: 'BOX', name: 'Box', type: UNIT_TYPES.QUANTITY },
    { symbol: 'SET', name: 'Set', type: UNIT_TYPES.QUANTITY },
    { symbol: 'LOT', name: 'Lot', type: UNIT_TYPES.QUANTITY }
];

 const SERVICE_UNITS = [
    { symbol: 'HR', name: 'Hour', type: UNIT_TYPES.TIME, isBase: true },
    { symbol: 'DAY', name: 'Day', type: UNIT_TYPES.TIME },
    { symbol: 'WK', name: 'Week', type: UNIT_TYPES.TIME },
    { symbol: 'MTH', name: 'Month', type: UNIT_TYPES.TIME },
    { symbol: 'MTR', name: 'Meter', type: UNIT_TYPES.LENGTH },
    { symbol: 'SQM', name: 'Square Meter', type: UNIT_TYPES.AREA },
    { symbol: 'CUM', name: 'Cubic Meter', type: UNIT_TYPES.VOLUME },
    { symbol: 'JOB', name: 'Job', type: UNIT_TYPES.LUMPSUM }
];


module.exports = {
    UNIT_TYPES,
    MATERIAL_UNITS,
    SERVICE_UNITS

};