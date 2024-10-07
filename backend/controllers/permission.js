const permission = require('../models/permissionModel')



const savePermission = async(req, res)=>{
    const {workflowId, workflowname, isCostCentreApplicable, workflowDetails} = req.body;

    try {
        let workflow = await permission.findOne({workflowId})
        if(workflow){
            workflow.workflowname = workflowname
            workflow.isCostCentreApplicable = isCostCentreApplicable
           
            workflow.workflowDetails = workflowDetails
        } else {
            workflow = new permission({
                workflowId,
                workflowname,
                isCostCentreApplicable,
                workflowDetails
            })
        }

        const savedWorkflow = await workflow.save()
        res.status(200).json({message: 'Workflow saved successfully ', workflow:savedWorkflow})

        
    } catch (error) {
        console.error('Error for saveing workflow', error)
        res.status(500).json({error:'Internal server error sadly'})
    }

    
}

const getPermission = async(req, res)=>{
    try {
        const userpermission = await permission.find({})
        res.status(200).json(userpermission)

        
    } catch (error) {
        res.status(400).json({error:error.message})
        
    }
}

const getPermissionRoleBase = async(req, res)=>{
    const {roleId} =req.query;

    try {
        let query = {}
        if(roleId){
            query = {roleId:roleId}
        }
        const userpermission = await permission.find(query)
        res.status(200).json(userpermission)
        
    } catch (error) {
        res.status(400).json({ error: error.message})
        
    }
}




module.exports = {savePermission, getPermission, getPermissionRoleBase}