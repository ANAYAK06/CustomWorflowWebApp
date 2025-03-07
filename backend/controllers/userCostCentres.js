
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
// Update/Edit User Cost Centres
const updateUserCostCentres = async (req, res) => {
    try {
        const { userId, roleId, addCostCentres, removeCostCentres, costCentreId } = req.body;

        // Validate required fields
        if (!userId || !roleId) {
            return res.status(400).json({ message: 'User ID and Role ID are required' });
        }

        console.log('Updating cost centres for user:', req.body);

        // Find the existing assignment
        let assignment = await usersCostCentre.findOne({ userId, roleId });

        // Handle direct costCentreId replacement (from frontend)
        if (costCentreId !== undefined) {
            // If no assignment exists, create new one
            if (!assignment) {
                assignment = new usersCostCentre({
                    userId,
                    roleId,
                    costCentreId: Array.isArray(costCentreId) ? costCentreId : [costCentreId],
                    assignedAt: Date.now()
                });
            } else {
                // Replace existing cost centres with new ones
                assignment.costCentreId = Array.isArray(costCentreId) ? costCentreId : [costCentreId];
                assignment.assignedAt = Date.now();
            }
            
            await assignment.save();
            return res.status(200).json({ 
                message: 'Cost centres updated successfully', 
                assignment 
            });
        }

        // Check if either add or remove operations are specified for the original approach
        if (!addCostCentres && !removeCostCentres) {
            return res.status(400).json({ message: 'Please specify cost centres to add or remove or provide costCentreId' });
        }

        // If no assignment exists and trying to remove, return error
        if (!assignment && removeCostCentres) {
            return res.status(404).json({ message: 'No cost centres assigned to this user yet' });
        }

        // If no assignment exists and adding new cost centres, create new assignment
        if (!assignment && addCostCentres) {
            const costCentresToAdd = Array.isArray(addCostCentres) ? addCostCentres : [addCostCentres];
            assignment = new usersCostCentre({
                userId,
                roleId,
                costCentreId: costCentresToAdd,
                assignedAt: Date.now()
            });
            
            await assignment.save();
            return res.status(200).json({ 
                message: 'Cost centres assigned successfully', 
                assignment 
            });
        }

        // Handle adding cost centres
        if (addCostCentres) {
            const costCentresToAdd = Array.isArray(addCostCentres) ? addCostCentres : [addCostCentres];
            // Use Set to ensure unique values
            assignment.costCentreId = [...new Set([...assignment.costCentreId, ...costCentresToAdd])];
        }

        // Handle removing cost centres
        if (removeCostCentres) {
            const costCentresToRemove = Array.isArray(removeCostCentres) ? removeCostCentres : [removeCostCentres];
            assignment.costCentreId = assignment.costCentreId.filter(
                ccId => !costCentresToRemove.includes(ccId)
            );
        }

        // Update assignment timestamp
        assignment.assignedAt = Date.now();
        
        // Save the updated assignment
        await assignment.save();
        
        res.status(200).json({ 
            message: 'Cost centres updated successfully', 
            assignment 
        });
        
    } catch (error) {
        console.error('Error in updateUserCostCentres:', error);
        res.status(500).json({ 
            message: 'Error updating cost centres', 
            error: error.toString() 
        });
    }
};

// Delete all cost centres assigned to a user
const deleteUserCostCentres = async (req, res) => {
    try {
        const { userId, roleId } = req.body;

        // Validate required fields
        if (!userId) {
            return res.status(400).json({ message: 'User ID is required' });
        }

        console.log('Deleting all cost centres for user:', userId);

        // Build query object - if roleId is provided, delete only for that role
        const query = { userId };
        if (roleId) {
            query.roleId = roleId;
            console.log('Deleting cost centres for specific role:', roleId);
        }

        // Find and delete the assignments
        const result = await usersCostCentre.deleteMany(query);

        // Check if any documents were deleted
        if (result.deletedCount === 0) {
            return res.status(404).json({ 
                message: 'No cost centre assignments found for this user' 
            });
        }

        res.status(200).json({ 
            message: `Successfully deleted ${result.deletedCount} cost centre assignment(s)`,
            deletedCount: result.deletedCount
        });
        
    } catch (error) {
        console.error('Error in deleteUserCostCentres:', error);
        res.status(500).json({ 
            message: 'Error deleting cost centre assignments', 
            error: error.toString() 
        });
    }
};



module.exports = {
    assignCostCentre,
    usersWithCostCentreApplicable,
    getAvaialbleCostCentres,
    viewUsersCostCentres,
    deleteUserCostCentres,
    updateUserCostCentres
    

}
