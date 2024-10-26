const mongoose = require('mongoose');
const AccountsNature = require('../../models/accountsNatureModel');
const AccountGroup = require('../../models/accountsGroupsModel');
const Ledger = require('../../models/accountsLedgerModel');

const getBalanceSheet = async (req, res) => {
    try {
        const { fiscalYear } = req.query;
        if (!fiscalYear) {
            return res.status(400).json({ message: 'FiscalYear Required' });
        }

        const [startYear, endYear] = fiscalYear.split('-').map(Number);
        const startDate = new Date(`${startYear}-04-01T00:00:00.000Z`);
        const endDate = new Date(`${endYear}-03-31T23:59:59.999Z`);

        const assetNatureId = 3;
        const liabilitiesNatureId = 4;

        async function getGroupsWithSubgroupsAndLedgers(parentGroupName, natureId) {
            const groups = await AccountGroup.find({
                groupUnder: parentGroupName,
                natureId,
                reportType: 'BS'
            }).sort('reportIndex');

            const groupsWithData = await Promise.all(groups.map(async (group) => {
                const subgroups = await getGroupsWithSubgroupsAndLedgers(group.groupName, natureId);
                
                // Find the ObjectId that corresponds to this group's numeric groupId
                const groupObjectId = await AccountGroup.findOne({ groupId: group.groupId }, '_id');
                
                const ledgers = await Ledger.find({
                    groupId: groupObjectId._id, // Use the ObjectId here
                    balanceAsOn: { $gte: startDate, $lte: endDate }
                });

                const ledgerSum = ledgers.reduce((sum, ledger) => sum + (ledger.openingBalance || 0), 0);
                const subgroupSum = subgroups.reduce((sum, subgroup) => sum + subgroup.amount, 0);

                return {
                    groupId: group.groupId,
                    groupName: group.groupName,
                    amount: ledgerSum + subgroupSum,
                    subgroups,
                    ledgers: ledgers.map(l => ({
                        ledgerId: l._id,
                        ledgerName: l.ledgerName,
                        amount: l.openingBalance || 0
                    }))
                };
            }));

            return groupsWithData;
        }

        const assets = await getGroupsWithSubgroupsAndLedgers('Primary', assetNatureId);
        const liabilities = await getGroupsWithSubgroupsAndLedgers('Primary', liabilitiesNatureId);

        const totalAssets = assets.reduce((sum, group) => sum + group.amount, 0);
        const totalLiabilities = liabilities.reduce((sum, group) => sum + group.amount, 0);

        res.json({
            fiscalYear,
            assets,
            liabilities,
            totalAssets,
            totalLiabilities
        });
    } catch (error) {
        console.error('Error generating balance sheet:', error);
        res.status(500).json({ message: 'Error generating balance sheet', error: error.message });
    }
};

module.exports = {
    getBalanceSheet
};