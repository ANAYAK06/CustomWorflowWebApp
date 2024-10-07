const AccountGroup = require('../models/accountsGroupsModel')

async function generatePLReport() {
    const expensesGroups = await AccountGroup.find({natureId:1}).sort('reportIndex') 
    const incomeGroups = await AccountGroup.find({natureId:2}).sort('reportIndex')

    let directExpenses = []
    let indirectExpenses = []
    let directIncome = []
    let indirectIncome = []
    let grossProfit = 0;
    let netProfit = 0;

    for(let group of expensesGroups){
        const amount = await calculateGroupTotal(group._id)
        if(group.affectsGrossProfit){
            directExpenses.push({name:group.groupName, amount})
        } else {
            indirectExpenses.push({name:group.groupName, amount})
        }
    }
    for (let group of  incomeGroups){
        const amount = await calculateGroupTotal(group._id)
        if(group.affectsGrossProfit){
            directIncome.push({name:group.groupName, amount})

        }else{
            indirectIncome.push({name:group.groupName, amount})
        }
    }

    const totalDirectExpenses = directExpenses.reduce((sum, item)=> sum + item.amount, 0)
const totalDirectIncome = directIncome.reduce((sum, item)=>sum + item.amount,0)

grossProfit = totalDirectIncome - totalDirectExpenses


const totalIndirectExpenses = indirectExpenses.reduce((sum, item)=> sum + item.amount,0)
const totalIndirectIncome = indirectIncome.reduce((sum, item)=>sum + item.amount, 0)
netProfit = grossProfit + totalIndirectIncome - totalDirectExpenses

return {
    directExpenses,
    indirectExpenses,
    directIncome,
    indirectIncome,
    grossProfit,
    netProfit
}


}

