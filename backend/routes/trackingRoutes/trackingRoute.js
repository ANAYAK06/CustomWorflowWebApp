const express = require('express')
const { verifyToken } = require('../../middlewares/requireAuth')
const TrackingController = require('../../controllers/trackingController')




const router = express.Router()

router.post('/query', 
  verifyToken, 
  TrackingController.processQuery.bind(TrackingController)
);

router.get('/status/:documentType/:referenceId', 
  verifyToken,
  TrackingController.getDocumentStatus.bind(TrackingController)
);
  

  
  
module.exports = router