const mongoose = require('mongoose')
const SDCA = require('../models/subDCAModel')
const DCA = require('../models/dcacodeModel')



const createSubDCA = async(req, res)=>{
    try {
        const {dcaCode, subdcaName} = req.body

        const dca = await DCA.findOne({code:dcaCode})
        if(!dca){
            throw new Error('DCA Not Found')
        }

        const latestSubDCA = await SDCA.findOne({dcaCode:dcaCode}).sort('-subCode')

        let newSubDCANumber
        if(latestSubDCA && latestSubDCA.subCode){
            const lastSubDcaNumber = parseInt(latestSubDCA.subCode.split('-')[1].split('.')[1])
            newSubDCANumber = lastSubDcaNumber + 1

        }else{
            newSubDCANumber = 1
        }

        const formattedSubDcaCode = `SDCA-${dcaCode.split('-')[1]}.${newSubDCANumber.toString().padStart(2,'0')}`

        const subDCAData = {
            dcaCode,
            subdcaName,
            subCode:formattedSubDcaCode
        }

        const newSubDCA = new SDCA(subDCAData)
        const saveSubDCA = await newSubDCA.save()

        res.status(201).json(saveSubDCA)
    } catch (error) {
        res.status(400).json({ error: error.message });
        
    }
}

module.exports = {
    createSubDCA
}