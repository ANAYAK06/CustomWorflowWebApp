const express = require('express');
const ClientPO = require('../models/clientPOModel');
const WorkflowService = require('../../controllers/workflowService');
const BOQ = require('../../models/boqModel');
const CostCentre = require('../../models/costCentreModel');
const {Client, SubClient} = require('../../AccountsModule/model/clientModel');
const State = require('../../models/stateModel')





const clientPOWorkflow = new WorkflowService({
    workflowId: 156, 
    Model: ClientPO,
    entityType: 'ClientPO',
    getNotificationMessage: (entity, action) => {
        switch(action) {
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

const getPerformingCostCentres = async (req, res) => {
    try {
        const costCentres = await CostCentre.find({ 
            ccType: '102',
            status: 'Active'
        }).select('ccNo ccName ccLocation');

        // Fetch states to map location codes
        const states = await State.find().select('code name');
        const stateMap = new Map(states.map(state => [state.code, state.name]));

        const enrichedCostCentres = costCentres.map(cc => ({
            ccNo: cc.ccNo,
            ccName: cc.ccName,
            ccLocation: cc.ccLocation,
            locationName: stateMap.get(cc.ccLocation) || 'Unknown'
        }));

        res.json({
            success: true,
            data: enrichedCostCentres
        });
    } catch (error) {
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

// Get client details based on type
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
            ClientPOStatus: 'Draft'
        };

        const result = await clientPOWorkflow.createEntity(clientPOData, req.user, poData.remarks);

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
            { path: 'subClientId', select: 'subClientCode' },
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
            await ClientPO.findByIdAndUpdate(id, { ClientPOStatus: 'Approved' });
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

        const result = await clientPOWorkflow.rejectEntity(id, req.user, remarks);

        // Update ClientPOStatus when PO is rejected
        await ClientPO.findByIdAndUpdate(id, { ClientPOStatus: 'Draft' });

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
    rejectClientPO
};