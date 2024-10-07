const mongoose = require('mongoose');
const { setBalanceType } = require('../hooks/accountsLedgerHelper')
const AccountsLedger = require('../models/accountsLedgerModel')





const createGeneralLedger = async (ledgerData) => {
    try {
        const balanceType = await setBalanceType(ledgerData.groupId)

        const newLedger = new AccountsLedger({
            ...ledgerData,
            balanceType: balanceType
        })

        await newLedger.save()
        return newLedger

    } catch (error) {
        throw error

    }
}


module.exports = { createGeneralLedger }
