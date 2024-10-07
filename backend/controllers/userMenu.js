const mongoose = require('mongoose')
const userMenu = require('../models/menuDataModel')
const Permission  = require('../models/permissionModel')



const getUserMenu = async(req, res)=>{

    try {

        const userMenuData = await userMenu.find()
        res.status(200).json(userMenuData)

        
    } catch (error) {
        res.status(400).json({error:error.message})
        
    }
}

const getRoleMenu = async(req, res)=>{
    const userRoleId = parseInt(req.query.userRoleId);
    console.log(`Received userRoleId: ${userRoleId}`);

    try {
        // fetch menudat and permission

        const menuData = await userMenu.find()
        const permissions = await Permission.find({"workflowDetails.roleId":userRoleId})
        


        //Flatten the permission for easier access 
        const flattenedPermissions = permissions.flatMap(permission =>
            permission.workflowDetails.map(detail => ({
                workflowId:permission.workflowId,
                roleId:detail.roleId,
                approvalLimit:detail.approvalLimit,
                pathId:detail.pathId
                
            }))
        )
     

        // filter menudata based on permission

        const filteredMenuData = menuData.map(menu => {
            const submenuWorkFlowIds = menu.submenuItems.map(item=>item.workflowId)
           
            const matchingPermissions = flattenedPermissions.filter(permission => submenuWorkFlowIds.includes(permission.workflowId))
           


            const filteredSubmenuItems = menu.submenuItems.filter(submenuItem =>
                matchingPermissions.some(permission =>
                    permission.workflowId === submenuItem.workflowId &&
                     permission.pathId === submenuItem.pathId &&
                      permission.roleId === userRoleId
                )
            )

            return {
                title:menu.title,
                icon:menu.icon,
                submenu:menu.submenu,
                submenuItems: filteredSubmenuItems
                
            };
        }).filter(menu => menu.submenuItems.length > 0)
        
        res.json(filteredMenuData)
        
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
        
    }
}





module.exports= {getUserMenu, getRoleMenu}