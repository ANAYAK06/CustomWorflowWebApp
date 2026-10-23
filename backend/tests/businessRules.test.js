const test = require('node:test');
const assert = require('node:assert/strict');
const {
    validateJointVenture,
    nextOpportunityNumber,
    calculateWonAmounts
} = require('../utils/businessRules');

const partner = (overrides = {}) => ({
    companyName: 'Partner Ltd',
    registrationNumber: 'REG-1',
    sharePercentage: 50,
    contactPerson: 'A. Person',
    contactEmail: 'a@example.com',
    contactPhone: '9999999999',
    isFrontParty: false,
    ...overrides
});

test('joint venture: valid partners pass', () => {
    const partners = [partner({ isFrontParty: true, sharePercentage: 60 }), partner({ sharePercentage: 40 })];
    assert.equal(validateJointVenture(partners), null);
});

test('joint venture: no partners means nothing to validate', () => {
    assert.equal(validateJointVenture([]), null);
    assert.equal(validateJointVenture(undefined), null);
});

test('joint venture: exactly one front party is required', () => {
    const none = [partner(), partner()];
    const two = [partner({ isFrontParty: true }), partner({ isFrontParty: true })];
    assert.match(validateJointVenture(none), /front party/);
    assert.match(validateJointVenture(two), /front party/);
});

test('joint venture: shares must add up to 100%', () => {
    const partners = [partner({ isFrontParty: true, sharePercentage: 60 }), partner({ sharePercentage: 30 })];
    assert.match(validateJointVenture(partners), /100%/);
});

test('joint venture: shares sent as strings are added as numbers', () => {
    const partners = [partner({ isFrontParty: true, sharePercentage: '70' }), partner({ sharePercentage: '30' })];
    assert.equal(validateJointVenture(partners), null);
});

test('joint venture: every partner needs all contact fields', () => {
    const partners = [partner({ isFrontParty: true }), partner({ contactEmail: '' })];
    assert.match(validateJointVenture(partners), /required fields/);
});

test('opportunity number: first of the year starts at 0001', () => {
    assert.equal(nextOpportunityNumber(null, 2026), 'EPPL/2026/0001');
});

test('opportunity number: increments the last serial', () => {
    assert.equal(nextOpportunityNumber('EPPL/2026/0007', 2026), 'EPPL/2026/0008');
    assert.equal(nextOpportunityNumber('EPPL/2026/0999', 2026), 'EPPL/2026/1000');
});

test('opportunity number: serial restarts in a new year', () => {
    assert.equal(nextOpportunityNumber('EPPL/2025/0042', 2026), 'EPPL/2026/0001');
});

test('won tender: variation and final accepted amount', () => {
    assert.deepEqual(calculateWonAmounts(1000000, 5), {
        finalVariationAmount: 50000,
        finalAcceptedAmount: 1050000
    });
});

test('won tender: zero variation keeps the negotiated amount', () => {
    assert.deepEqual(calculateWonAmounts(250000, 0), {
        finalVariationAmount: 0,
        finalAcceptedAmount: 250000
    });
});
