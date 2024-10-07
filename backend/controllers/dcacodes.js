const mongoose = require('mongoose')
const DCA = require('../models/dcacodeModel')
const CostCentreType = require('../models/costCentreTypeModel')


const createDCA = async(req, res)=>{
    try {
        const {name, applicableCostCentres, applicableForItemCode, itemCodeType} = req.body

        const latestDCA = await DCA.findOne().sort('-code');
        let newCodeNumber;
        if(latestDCA && latestDCA.code){
            const lastCodeNumber = parseInt(latestDCA.code.split('-')[1]);
            newCodeNumber = lastCodeNumber + 1
        } else {
            newCodeNumber = 1
        }
        

        const formattedCode = `DCA-${newCodeNumber.toString().padStart(2,'0')}`

        const formattedApplicableCostCentres = await Promise.all(applicableCostCentres.map(async(cc)=>{
            console.log(`Fetching cost centre type for ccid: ${cc.ccid}`); 

            const costCentreType = await CostCentreType.findOne({ccid:cc.ccid});
            if(!costCentreType){
                throw new Error(`Invalid Cost Centre Type : ${cc.ccid}`)
            }
            const validSubId = (cc.subId ||[]).filter(subId =>
                costCentreType.subType.some(validSubType =>validSubType.subId === subId)
            )
            return{
                ccid:costCentreType.ccid,
                subId:validSubId
            }
        }));
        const dcaData = {
            code:formattedCode,
            name,
            applicableCostCentres:formattedApplicableCostCentres,
            applicableForItemCode
        }

        if(applicableForItemCode){
            if(!itemCodeType){
                throw new Error ('Item code Type is  required  when applicable for item Code is true')
            }
            dcaData.itemCodeType = itemCodeType
        }
        const newDCA = new DCA(dcaData)
        const saveDCA = await newDCA.save()
        res.status(201).json(saveDCA)
        
    } catch (error) {
        res.status(400).json({ error: error.message });
        
    }
}

const updateDCA = async(req,res)=>{
    try {
        const { name, applicableCostCentres, applicableForItemCode, itemCodeType, isActive } = req.body;

        // validate the format applicable cost centres 
        const formattedApplicableCostCentres = await Promise.all(applicableCostCentres.map(async(cc)=>{
            console.log(`Fetching cost centre type for: ${cc.ccid}`);
            const costCentreType = await CostCentreType.findOne({ccid:cc.ccid})
            if(!costCentreType) {
                throw new Error(`Invalid Cost centre type ${cc.ccType}`);
            }
            const validSubTypes = cc.subTypes.filter(subType=>
                costCentreType.subType.some(validSubType =>validSubType.subId === subType)
            )
            return{
                ccid:costCentreType._id,
                subType:costCentreType.subType
                .filter(subType=>validSubTypes.includes(subType.subId))
                .map(subType => subType.subId)
            }
        }))
        const updateData = {
            name,
            applicableCostCentres:formattedApplicableCostCentres,
            applicableForItemCode,
            isActive
        }
        if(applicableForItemCode){
            if(!itemCodeType){
                throw new Error ('Item code type is required when applicable item code is true')
            }
            updateData.itemCodeType = itemCodeType
            
        }else{
            updateData.itemCodeType = undefined
        }
        const updatedDCA = await DCA.findOneAndUpdate(
            {code: req.params.code},
            updateData,
            {new: true, runValidators:true}
        ).populate({
            path:'applicableCostCentres.ccType',
            select: 'ccType ccid'
        }).populate({
            path: 'applicableCostCentres.subTypes',
            select: 'sType subId'
        
        })
        if(!updatedDCA){
            return res.status(404).json({message:'DCA Not Found'})
        }
        res.status(200).json(updatedDCA)
    } catch (error) {
        res.status(400).json({ error: error.message });
        
    }
}

const getDCAForDropdown = async (req,res)=>{
    try {
        const {ccType, subType} = req.query;
        if(!ccType){
            return res.status(400).json({error:'Cost Centre Type (ccType) is required '})
        }
        const costCentreType = await CostCentreType.findOne({ccType:ccType});
        if(!costCentreType){
            return res.status(404).json({error:'cost centre type not found'})
        }
        let query = {
            'applicableCostCentres.ccType':costCentreType._id,
            isActive:true
        };

        if(subType){
            const subTypeObj = costCentreType.subType.find(st=> st.sType === subType);
            if(!subTypeObj){
                return res.status(404).json({error:'subtype not found for the given cost centre'})
            }
            query['applicableCostCentres.subTypes'] = subTypeObj._id
        }

        const dcas = await DCA.find(query)
        .select('code name')
        .sort('code')

        const formattedDCAs = dcas.map(dca=>({
            value:dca.code,
            label:`${dca.code}- ${dca.name}`
        }))
        res.status(200).json(formattedDCAs)



    } catch (error) {
        
        res.status(400).json({ error: error.message });
    }
}

const getDCACodes = async(req,res)=>{
    try {
        const dcaCodes = await DCA.find()
        res.status(200).json(dcaCodes)
        console.log(dcaCodes)
        
    } catch (error) {
        res.status(500).json({ error: error.message });
        
    }
}


module.exports = {
    createDCA,
    updateDCA,
    getDCAForDropdown,
    getDCACodes
}