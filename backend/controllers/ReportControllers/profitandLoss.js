const mongoose = require('mongoose');
const AccountGroup = require('../../models/accountsGroupsModel');
const Ledger = require('../../models/accountsLedgerModel');

const getProfitAndLoss = async (req, res) => {
    try {
        console.log('Received request for Profit and Loss report');
        const { fiscalYear } = req.query;
        if (!fiscalYear) {
            return res.status(400).json({ message: 'FiscalYear Required' });
        }
        console.log(`Fiscal Year: ${fiscalYear}`);

        const [startYear, endYear] = fiscalYear.split('-').map(Number);
        const startDate = new Date(`${startYear}-04-01T00:00:00.000Z`);
        const endDate = new Date(`${endYear}-03-31T23:59:59.999Z`);
        console.log(`Date range: ${startDate} to ${endDate}`);

        const incomeNatureId = 2;
        const expenseNatureId = 1;

        async function getGroupsWithSubgroupsAndLedgers(natureId, affectsGrossProfit) {
            console.log(`Fetching groups for natureId: ${natureId}, affectsGrossProfit: ${affectsGrossProfit}`);
            const groups = await AccountGroup.find({
                natureId,
                affectsGrossProfit,
                reportType: 'PL'
            }).sort('reportIndex');
            console.log(`Found ${groups.length} groups`);

            const groupIds = groups.map(group => group._id);
            const ledgers = await Ledger.find({
                groupId: { $in: groupIds },
                date: { $gte: startDate, $lte: endDate }
            });

            const ledgersByGroup = ledgers.reduce((acc, ledger) => {
                if (!acc[ledger.groupId]) acc[ledger.groupId] = [];
                acc[ledger.groupId].push(ledger);
                return acc;
            }, {});

            const groupsWithData = await Promise.all(groups.map(async (group) => {
                console.log(`Processing group: ${group.groupName}`);
                
                const groupLedgers = ledgersByGroup[group._id] || [];
                const ledgerSum = groupLedgers.reduce((sum, ledger) => sum + (ledger.closingBalance || 0), 0);

                // Fetch subgroups
                const subgroups = await AccountGroup.find({ groupUnder: group.groupName, natureId, affectsGrossProfit });
                const subgroupIds = subgroups.map(subgroup => subgroup._id);
                const subgroupLedgers = await Ledger.find({
                    groupId: { $in: subgroupIds },
                    date: { $gte: startDate, $lte: endDate }
                });

                const subgroupLedgersByGroup = subgroupLedgers.reduce((acc, ledger) => {
                    if (!acc[ledger.groupId]) acc[ledger.groupId] = [];
                    acc[ledger.groupId].push(ledger);
                    return acc;
                }, {});

                const subgroupsWithData = subgroups.map(subgroup => {
                    const subgroupLedgers = subgroupLedgersByGroup[subgroup._id] || [];
                    const subgroupLedgerSum = subgroupLedgers.reduce((sum, ledger) => sum + (ledger.closingBalance || 0), 0);
                    return {
                        groupId: subgroup._id,
                        groupName: subgroup.groupName,
                        amount: subgroupLedgerSum,
                        ledgers: subgroupLedgers.map(l => ({
                            ledgerId: l._id,
                            ledgerName: l.ledgerName,
                            amount: l.closingBalance || 0
                        }))
                    };
                });

                const subgroupSum = subgroupsWithData.reduce((sum, subgroup) => sum + subgroup.amount, 0);

                return {
                    groupId: group._id,
                    groupName: group.groupName,
                    amount: ledgerSum + subgroupSum,
                    affectsGrossProfit: group.affectsGrossProfit,
                    subgroups: subgroupsWithData,
                    ledgers: groupLedgers.map(l => ({
                        ledgerId: l._id,
                        ledgerName: l.ledgerName,
                        amount: l.closingBalance || 0
                    }))
                };
            }));

            return groupsWithData;
        }

        console.log('Fetching income and expense data');
        const [revenue, costOfGoodsSold, otherIncome, expenses] = await Promise.all([
            getGroupsWithSubgroupsAndLedgers(incomeNatureId, true),  // Revenue
            getGroupsWithSubgroupsAndLedgers(expenseNatureId, true), // Cost of Goods Sold
            getGroupsWithSubgroupsAndLedgers(incomeNatureId, false), // Other Income
            getGroupsWithSubgroupsAndLedgers(expenseNatureId, false) // Expenses
        ]);

        console.log('Calculating totals');
        const totalRevenue = revenue.reduce((sum, group) => sum + group.amount, 0);
        const totalCostOfGoodsSold = costOfGoodsSold.reduce((sum, group) => sum + group.amount, 0);
        const grossProfit = totalRevenue - totalCostOfGoodsSold;

        const totalOtherIncome = otherIncome.reduce((sum, group) => sum + group.amount, 0);
        const totalExpenses = expenses.reduce((sum, group) => sum + group.amount, 0);

        const netProfit = grossProfit + totalOtherIncome - totalExpenses;

        const responseData = {
            fiscalYear,
            revenue,
            costOfGoodsSold,
            grossProfit,
            otherIncome,
            expenses,
            totalRevenue,
            totalCostOfGoodsSold,
            totalOtherIncome,
            totalExpenses,
            netProfit
        };

        console.log('Sending response');
        console.log('Response Data:', responseData);
        res.json(responseData);
        
    } catch (error) {
        console.error('Error generating profit and loss report:', error);
        res.status(500).json({ message: 'Error generating profit and loss report', error: error.message, stack: error.stack });
    }
};

module.exports = {
    getProfitAndLoss
};