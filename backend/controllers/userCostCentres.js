
const usersCostCentre = require('../models/userCostCentres')
const costCentre = require('../models/costCentreModel')
const UserRoles = require('../models/userRolesModel')
const Users = require('../models/usersModel')





//get Unassigned cost centres for role 

const getAvaialbleCostCentres = async (req, res)=>{
    try {
        const userId = req.params.userId
        console.log('Fetching cost centres for user:', userId);

        const  user = await Users.findById(userId)
        if(!user){
            console.log('User not found');
            return res.status(404).json({ error: 'User not found' });
        }
        console.log('User found:', user.userName, 'Role ID:', user.roleId);

        
        

        const userRole = await UserRoles.findOne({roleId:user.roleId})
        if(!userRole){
            console.log('User role not found');
            return res.status(404).json({ error: 'User role not found' });
        }
        console.log('User role found, cost centre types:', userRole.costCentreTypes);

       const costCentreTypes = userRole.costCentreTypes.map(Number)

       const assignedCostCentres = await usersCostCentre.find({roleId:user.roleId})
       .distinct('costCentreId')
       console.log('Assigned cost centres:', assignedCostCentres);

       const matchingCostCentres = await costCentre.find({
        ccType:{$in: costCentreTypes.map(String)},
        ccNo:{$nin: assignedCostCentres}
       }).select('ccNo ccName')

       res.json(matchingCostCentres)

       
    } catch (error) {
        console.error('Error in getAvailableCostCentres:', error);
    res.status(500).json({ error: 'An error occurred while fetching cost centres', details: error.message });
        
    }
}


//Assign cost centre to user

const assignCostCentre = async(req, res)=>{
    try {
        const {userId, roleId, costCentreId} = req.body;

        if (!userId || !roleId || !costCentreId) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        console.log('Received data:', { userId, roleId, costCentreId }); 

        let assignment = await usersCostCentre.findOne({userId, roleId})

        if(assignment){
            const newCostCentres = Array.isArray(costCentreId) ? costCentreId:[costCentreId]
            assignment.costCentreId = [...new Set([...assignment.costCentreId, ...newCostCentres])];
           
            assignment.assignedAt = Date.now()
        }else{
            assignment = new usersCostCentre({userId,roleId,costCentreId:Array.isArray(costCentreId)? costCentreId:[costCentreId]})
        }
        await assignment.save()
        res.status(200).json({messge:'Cost centre assigned successfully ', assignment})
        
    } catch (error) {
        console.error('Error in assignCostCentre:', error);
        res.status(500).json({ message: 'Error assigning cost centre', error: error.toString() });
        
    }

}


// Get cost centre applicable users 

const  usersWithCostCentreApplicable =  async (req, res)=>{
    try {
        const applicableRoles = await UserRoles.find({isCostCentreApplicable:true}).select('roleId')

        const applicableRoleIds = applicableRoles.map(role=> role.roleId)

        const usersWithCostCentres = await usersCostCentre.distinct('userId')

        const users = await Users.find({
            roleId: {$in: applicableRoleIds},
            status:{$ne:0},
            _id:{$nin:usersWithCostCentres}
        }).select('_id userName roleId')

        res.json(users)
        
    } catch (error) {
        res.status(500).json({ message: 'Error fetching cost centre users', error: error.message });
        
    }
}

// View user Cost centres

const viewUsersCostCentres = async(req, res)=>{
    try {
        const userCC = await usersCostCentre.find({})
        res.status(200).json(userCC)
        
    } catch (error) {
        res.status(400).json({error:error.message})
        
    }
}


module.exports = {
    assignCostCentre,
    usersWithCostCentreApplicable,
    getAvaialbleCostCentres,
    viewUsersCostCentres
    

}
