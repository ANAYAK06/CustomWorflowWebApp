const express = require('express');
const ClientPO = require('../models/clientPOModel');
const WorkflowService = require('../../controllers/workflowService');
const BOQ = require('../../models/boqModel');
const CostCentre = require('../../models/costCentreModel');
const { Client, SubClient } = require('../../AccountsModule/model/clientModel');
const State = require('../../models/stateModel')





const clientPOWorkflow = new WorkflowService({
    workflowId: 157,
    Model: ClientPO,
    entityType: 'ClientPO',
    getNotificationMessage: (entity, action) => {
        switch (action) {
            case 'created':
                return `New Client PO created: ${entity.poNumber}`;
            case 'nextLevel':
                return `Client PO ${entity.poNumber} moved to next level`;
            case 'approved':
                return `Client PO ${entity.poNumber} has been approved`;
            case 'rejected':
                return `Client PO ${entity.poNumber} has been rejected`;
            default:
                return `Client PO ${entity.poNumber} ${action}`;
        }
    }
});


// For cost centers
const getPerformingCostCentres = async (req, res) => {
    try {
        const costCentres = await CostCentre.find({ 
            ccType: '102',
            status: 'Approved'
        }).select('_id ccNo ccName location');
        
        // Get the single document containing all states
        const stateDocument = await State.findOne();
        
        // Create a normalized state map from the raw document JSON
        const stateMap = {};
        
        if (stateDocument) {
            // Convert the document to a plain JavaScript object
            const stateDocString = JSON.stringify(stateDocument);
            const stateDocObject = JSON.parse(stateDocString);
            
            console.log('Parsed state doc keys:', Object.keys(stateDocObject));
            
            // Now we can safely access the states array from the parsed object
            if (stateDocObject.states && Array.isArray(stateDocObject.states)) {
                console.log(`Found ${stateDocObject.states.length} states in the parsed document`);
                
                stateDocObject.states.forEach(state => {
                    if (state && state.code && state.name) {
                        const normalizedCode = String(state.code).trim();
                        console.log(`Adding state mapping: code="${normalizedCode}", name="${state.name}"`);
                        stateMap[normalizedCode] = state.name;
                    }
                });
                
                console.log(`Built state map with ${Object.keys(stateMap).length} entries`);
            } else {
                console.log("No states array in the parsed document");
            }
        } else {
            console.log("No state document found");
        }
        
        const enrichedCostCentres = costCentres.map(cc => {
            // Normalize the location code from cost center
            const normalizedLocation = cc.location ? String(cc.location).trim() : '';
            
            // Direct string lookup with fallback
            const locationName = stateMap[normalizedLocation] || 'Unknown';
            console.log(`Mapped location "${normalizedLocation}" to "${locationName}"`);
            
            return {
                _id: cc._id,
                ccNo: cc.ccNo,
                ccName: cc.ccName,
                location: cc.location,
                locationName: locationName
            };
        });
        
        res.json({
            success: true,
            data: enrichedCostCentres
        });
    } catch (error) {
        console.error("Error in getPerformingCostCentres:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

const getSubClients = async (req, res) => {
    try {  
        const {clientId} = req.params;

        const client = await Client.findById(clientId);
        if(!client) {
            return res.status(404).json({
                success: false,
                message: 'Client not found'
            });
        }
        
        if(client.clientType === 'Individual') {
            return res.json({
                success: true,
                data: []
            });
        }
        
        // Make sure to select the correct fields
        const subClients = await SubClient.find({
            mainClientId: clientId, 
            status: 'Approved'
        }).select('_id subClientCode gstNumber registeredAddress stateCode');
        
        // Get the state document
        const stateDocument = await State.findOne();
        
        // Create a state map from the raw document JSON
        const stateMap = {};
        
        if (stateDocument) {
            // Convert the document to a plain JavaScript object
            const stateDocString = JSON.stringify(stateDocument);
            const stateDocObject = JSON.parse(stateDocString);
            
            console.log('Parsed subclient state doc keys:', Object.keys(stateDocObject));
            
            // Now we can safely access the states array from the parsed object
            if (stateDocObject.states && Array.isArray(stateDocObject.states)) {
                console.log(`Found ${stateDocObject.states.length} states in the parsed document for subclients`);
                
                stateDocObject.states.forEach(state => {
                    if (state && state.code && state.name) {
                        const normalizedCode = String(state.code).trim();
                        stateMap[normalizedCode] = state.name;
                    }
                });
                
                console.log(`Built subclient state map with ${Object.keys(stateMap).length} entries`);
                console.log('Subclient state map keys (sample):', Object.keys(stateMap).slice(0, 5));
            } else {
                console.log("No states array in the parsed document for subclients");
            }
        } else {
            console.log("No state document found for subclients");
        }
        
        const enrichedSubClients = subClients.map(subclient => {
            // Normalize the state code from subclient
            const normalizedStateCode = subclient.stateCode ? String(subclient.stateCode).trim() : '';
            
            // Direct string lookup with fallback
            const stateName = stateMap[normalizedStateCode] || 'Unknown';
            console.log(`Mapped subclient stateCode "${normalizedStateCode}" to "${stateName}"`);
            
            return {
                _id: subclient._id,
                subClientCode: subclient.subClientCode,
                gstNumber: subclient.gstNumber,
                stateCode: subclient.stateCode,
                stateName: stateName
            };
        });
        
        res.json({
            success: true,
            data: enrichedSubClients
        });
    } catch (error) {   
        console.error("Error in getSubClients:", error);
        res.status(500).json({
            success: false, 
            error: error.message
        });
    }    
};

// Get won BOQs
const getWonBOQs = async (req, res) => {
    try {
        const boqs = await BOQ.find({
            boqStatus: 'won'
        }).select('offerNumber items');

        res.json({
            success: true,
            data: boqs
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get client details


const getAllClients = async (req, res) => {
    try {
        const clients = await Client.find({ status: 'Approved' }).select(' _id clientName clientCode clientType');
        res.json({
            success: true,
            data: clients
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}



const getClientDetails = async (req, res) => {
    try {
        const { clientId } = req.params;

        const client = await Client.findById(clientId)
            .populate({
                path: 'subClients',
                match: { status: 'Approved' },
                select: 'subClientCode gstNumber'
            });

        if (!client) {
            return res.status(404).json({
                success: false,
                message: 'Client not found'
            });
        }

        res.json({
            success: true,
            data: {
                clientType: client.clientType,
                clientName: client.clientName,
                subClients: client.clientType === 'Individual' ? [] : client.subClients
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Create Client PO
const createClientPO = async (req, res) => {
    try {
        const poData = req.body;

        // Validate client exists
        const client = await Client.findById(poData.clientId);
        if (!client) {
            return res.status(404).json({
                success: false,
                message: 'Client not found'
            });
        }

        // Validate subclient requirement based on client type
        if (client.clientType !== 'Individual') {
            if (!poData.subClientId) {
                return res.status(400).json({
                    success: false,
                    message: 'Subclient is required for non-individual clients'
                });
            }

            // Validate subclient exists and belongs to client
            const subClient = await SubClient.findOne({
                _id: poData.subClientId,
                mainClientId: poData.clientId,
                status: 'Approved'
            });

            if (!subClient) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or unapproved subclient'
                });
            }
        } else {
            // Remove subclient reference for individual clients
            delete poData.subClientId;
        }

        // Validate required PO number
        if (!poData.poNumber) {
            return res.status(400).json({
                success: false,
                message: 'PO number is required'
            });
        }

        // Check if PO number already exists
        const existingPO = await ClientPO.findOne({ poNumber: poData.poNumber });
        if (existingPO) {
            return res.status(400).json({
                success: false,
                message: 'PO number already exists'
            });
        }

        // Calculate total values for items
        poData.items = poData.items.map(item => ({
            ...item,
            totalValue: item.quantity * item.rate
        }));

        const clientPOData = {
            ...poData,
            status: 'Verification',
            ClientPOStatus: 'Submitted'
        };

        const result = await clientPOWorkflow.createEntity(clientPOData, req.user, poData.remarks);

        await BOQ.findByIdAndUpdate(poData.boqId, { boqStatus: 'POCreated' });

        res.status(201).json({
            success: true,
            message: 'Client PO created successfully',
            data: result.entity
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Get POs for verification
const getPOsForVerification = async (req, res) => {
    try {
        const userRoleId = parseInt(req.query.userRoleId);
        if (isNaN(userRoleId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid userRoleId provided'
            });
        }

        const result = await clientPOWorkflow.getEntitiesForVerification(userRoleId);

        const populatedData = await ClientPO.populate(result.data, [
            { path: 'clientId', select: 'clientName clientCode clientType' },
            { path: 'subClientId', select: 'subClientCode stateName' },
            { path: 'costCentreId', select: 'ccNo ccName' },
            { path: 'boqId', select: 'offerNumber' }
        ]);

        res.json({
            success: true,
            data: populatedData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Verify Client PO
const verifyClientPO = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        if (!remarks) {
            return res.status(400).json({
                success: false,
                message: "Remarks are required for verification"
            });
        }

        const result = await clientPOWorkflow.verifyEntity(id, req.user, remarks);

        // Update ClientPOStatus to InProgress when moved to verification
        if (result.data.status === 'Verification') {
            await ClientPO.findByIdAndUpdate(id, { ClientPOStatus: 'InProgress' });
        }

        // Update ClientPOStatus to Approved when PO is approved
        if (result.data.status === 'Approved') {
            await ClientPO.findByIdAndUpdate(id, { ClientPOStatus: 'Accepted' });
        }

        res.json({
            success: true,
            message: result.message,
            data: result.data
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Reject Client PO
const rejectClientPO = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        if (!remarks) {
            return res.status(400).json({
                success: false,
                message: "Remarks are required for rejection"
            });
        }

        const clientPO = await ClientPO.findById(id);
        if (!clientPO) {
            return res.status(404).json({
                success: false,
                message: "Client PO not found"
            });
        }

        const result = await clientPOWorkflow.rejectEntity(id, req.user, remarks);

        // Update ClientPOStatus when PO is rejected
        await ClientPO.findByIdAndUpdate(id, { ClientPOStatus: 'Rejected' });

        if (clientPO.boqId) {
            await BOQ.findByIdAndUpdate(clientPO.boqId, { boqStatus: 'won' });
        }

        res.json({
            success: true,
            message: 'Client PO rejected successfully',
            data: result.data
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

module.exports = {
    getPerformingCostCentres,
    getWonBOQs,
    getClientDetails,
    createClientPO,
    getPOsForVerification,
    verifyClientPO,
    rejectClientPO,
    getAllClients,
    getSubClients
};