const test = require('node:test');
const assert = require('node:assert/strict');
const workflowConfig = require('../config/workflowConfig');

const documentTypes = Object.entries(workflowConfig.documentTypes);

test('every workflow document type is fully configured', () => {
    assert.ok(documentTypes.length > 0);
    for (const [name, config] of documentTypes) {
        assert.equal(typeof config.workflowId, 'number', `${name}: workflowId`);
        assert.ok(config.model, `${name}: model`);
        assert.ok(Array.isArray(config.searchFields) && config.searchFields.length > 0, `${name}: searchFields`);
        assert.equal(typeof config.isCostCentreApplicable, 'boolean', `${name}: isCostCentreApplicable`);
    }
});

test('the primary reference field is always searchable', () => {
    for (const [name, config] of documentTypes) {
        assert.ok(config.searchFields.includes(config.primaryReferenceField), `${name}: ${config.primaryReferenceField}`);
    }
});

test('workflow ids are unique', () => {
    const ids = documentTypes.map(([, config]) => config.workflowId);
    assert.equal(new Set(ids).size, ids.length);
});
