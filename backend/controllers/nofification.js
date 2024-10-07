const Notification = require('../models/notificationHubModel')
const notificationEmitter = require('../notificationEmitter')
const User = require('../models/usersModel')
const UserCostCentre = require('../models/userCostCentres')
const UserRoles = require('../models/userRolesModel')
const Permission = require('../models/permissionModel')



const getNotification = async(req, res) => {
    const userId = req.user._id
    const userRoleId = parseInt(req.query.userRoleId)
    

    try {
        const user = await User.findById(userId)
        if(!user){
            return res.status(404).json({message: 'User Not found'})
        }
        const userRole = await UserRoles.findOne({roleId:user.roleId})

        if(!userRole){
            return res.status(404).json({message:'Role Not found for User'})

        }
        
        if(userRole.roleId !== userRoleId){
            return res.status(404).json({ message: 'Role Not found for User' });
        }
        let notifications

        if(userRole.isCostCentreApplicable){
            const userCostCentres = await UserCostCentre.findOne({userId, roleId:userRoleId})
            if(!userCostCentres || !userCostCentres.costCentreId.length){
                return res.status(200).json({notifications:[]})
            }
            notifications = await Notification.find({
                roleId:userRoleId,
                status:'Pending',
                'relatedEntity.ccNo':{$in : userCostCentres.costCentreId}
            });

        }else{
            notifications = await Notification.find({roleId:userRoleId, status:'Pending'})
        }
        res.status(200).json(notifications)

        
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Server Error', error });
    }

}

const getNotificationCount = async(req, res)=>{
    const userId = req.user._id
    const userRoleId = parseInt(req.query.userRoleId)

    try {
        const user = await User.findById(userId)
        if(!user){
            return res.status(404).json({message:'No user found'})
        }
        const userRole = await UserRoles.findOne({roleId:userRoleId})
        if(!userRole){
            return res.status(404).json({message:'Role Not found'})
        }
        if(user.roleId !== userRoleId){
            return res.status(403).json({message:'User does not have the spefied role'})
        }

        let notificationQuery = {
            roleId: userRoleId,
            status:'Pending'
        }

        if(userRole.isCostCentreApplicable){
            const userCostCentres = await UserCostCentre.findOne({userId, roleId:userRoleId})
       const usercostCentreIds = userCostCentres ? userCostCentres.costCentreId : []

        notificationQuery.$or = [
            {isCostCentreBased:false},
            {isCostCentreBased:true, ccCode: {$in: usercostCentreIds}}
        ]
       

        }
        
       

       const count = await Notification.countDocuments(notificationQuery)

       res.status(200).json({count})
        

        notificationEmitter.emit('notification', {userRoleId, count})


        
    } catch (error) {
        console.error('Error fetching notification count:', error);
        res.status(500).json({ message: 'Server Error' });
    }
    
}



module.exports = {
    getNotification,
    getNotificationCount,
    
}