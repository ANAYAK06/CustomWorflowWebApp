// ledgerHelpers.js
const mongoose = require('mongoose');
const AccountGroup = mongoose.model('accountgroup');

const setBalanceType = async (groupId) => {
    try {
        const group = await AccountGroup.findById(groupId);

        if (!group) {
            throw new Error('Associated account group not found');
        }

        if (group.natureId === 1 || group.natureId === 3) { // Expense or Asset
            return 'Dr';
        } else if (group.natureId === 2 || group.natureId === 4) { // Income or Liability
            return 'Cr';
        } else {
            throw new Error('Invalid natureId in associated account group');
        }
    } catch (error) {
        throw error;
    }
};

module.exports = { setBalanceType };