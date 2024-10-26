const express = require ('express')
const mongoose = require('mongoose')
const notificationEmitter = require('./notificationEmitter')
const cors = require('cors')

require('dotenv').config()





const ccTypeRoute = require('./routes/costCentreTypeRoute')
const UserRoleRoute = require('./routes/userRolesRoute')
const usersRoutes = require('./routes/usersRoute')
const loginRoute = require('./routes/loginRoute')
const menuRoute = require('./routes/menuRoute')
const userMenu = require('./routes/userMenuRoute')
const userPermission = require('./routes/permissionRoute')
const ccState = require('./routes/userStates')
const costCentreRoute = require('./routes/costCentreRoute')
const NotificationRoute = require('./routes/notificationRoute')
const UserCostCentreRoute = require('./routes/userCostCentreRoute')
const AccountsGroupsRoute = require('./routes/accountsGroupRoute')
const AccountsLedgerRoute = require('./routes/accountsLedgerRoute')
const DCACodeRoute = require('./routes/dcaRoute')
const CCBudgetRoute = require('./routes/ccBudgetRoute')
const DCABudgetRoute = require('./routes/dcaBudgetRoute')
const ReportsRoute = require('./routes/reportsRoutes')
const DashboardPreferenceRoute = require('./routes/dashboardPreferenceRoute')


    




const app = express()




//middlewares
app.use((req, res, next)=>{
    console.log(req.path, req.method)
    next()
})
app.use(express.json())

// cors
app.use(cors())

//routes

app.use('/api/cctype', ccTypeRoute)
app.use('/api/roles',UserRoleRoute)
app.use('/api/user',usersRoutes)
app.use('/api/loginuser',loginRoute )
app.use('/api/getmenu', menuRoute)
app.use('/api/usermenudata', userMenu)
app.use('/api/permissions', userPermission)
app.use('/api/ccstate', ccState)
app.use('/api/costcentres', costCentreRoute)
app.use('/api/notification', NotificationRoute)
app.use('/api/userscostcentres', UserCostCentreRoute)
app.use('/api/accountsgroup', AccountsGroupsRoute)
app.use('/api/accountsledger', AccountsLedgerRoute)
app.use('/api/budgetdca', DCACodeRoute)
app.use('/api/ccbudget', CCBudgetRoute)
app.use('/api/dcabudgetaccount', DCABudgetRoute)
app.use('/api/reports/',ReportsRoute)
app.use('/api/dashboard/', DashboardPreferenceRoute)

// SSE route

app.get('/see/notification', (req, res)=>{
    const userRoleId = parseInt(req.query.userRoleId)
    
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control','no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    console.log(`SSE connection established for userRoleId: ${userRoleId}`);

    const sendNotification = (data) => {
        if(data.userRoleId === userRoleId){
            
            res.write(`data: ${JSON.stringify({ count:data.count })}\n\n`)

        }
        
    };
    notificationEmitter.on('notification', sendNotification);

    const heartbeat = setInterval(()=>{
        res.write(`data:{}\n\n`)
    }, 30000)

    req.on('close',()=>{
        notificationEmitter.off('notification', sendNotification)
        console.log(`SSE connection closed for userRoleId: ${userRoleId}`)
    })
})


//db connection

mongoose.connect(process.env.MONGODB_URI)
.then(()=>{

    console.log('connected to DB')

    app.listen(process.env.PORT, ()=>{

        console.log('app listening on port number 4000')
    })
    
})

