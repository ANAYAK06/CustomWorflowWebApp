const jwt = require('jsonwebtoken')
const User = require('../models/usersModel')


function  generateToken(user) {
    const payload = {
        id: user._id,
        username:user.username,
        email:user.email,
        roleId:user.roleId,
        status:user.status
    }

    return jwt.sign(payload, process.env.SECRET, {expiresIn: '3d'})
}


function verifyToken(req, res, next){
    const authHeader = req.headers['authorization']

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('Authorization header is missing or invalid format');
        return res.status(401).json({ message: 'No token provided or invalid format' });
    }
    const token = authHeader && authHeader.split(' ')[1]

   


    if(!token){
        return res.status(401).json({message:'No token Provided'})
    }

    jwt.verify(token, process.env.SECRET, async (err, decoded)=>{
        if(err){
            return res.status(401).json({message:'Invalid Token'})
            
        }
        try {
            const user = await User.findById(decoded.id);
            

            if(!user){
                return res.status(401).json({message:'User Not Found'})
            }
            req.user = user;
            next();
            
        } catch (error) {
            console.error('Error fetching  user data', error);

            return res.status(500).json({message:'Server Error'});
            
        }


       
    })
}

module.exports = {generateToken, verifyToken}