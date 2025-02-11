const {Client, SubClient} = require('../model/clientModel');
const AccountsLedger = require('../../models/accountsLedgerModel');
const WorkflowService = require('../../controllers/workflowService');
const ClientInvoice = require('../model/clientInvoiceModel');
const CostCentre = require('../../models/costCentreModel');

// Initialize workflow service
const clientWorkflow = new WorkflowService({
    workflowId: 154,
    Model: Client,
    entityType: 'Client',
    getNotificationMessage: (entity, action) => {
        switch(action) {
            case 'created':
                return `New client registration: ${entity.clientName} (${entity.clientCode})`;
            case 'nextLevel':
                return `Client ${entity.clientName} moved to next level of verification`;
            case 'approved':
                return `Client ${entity.clientName} has been approved`;
            case 'rejected':
                return `Client ${entity.clientName} has been rejected`;
            default:
                return `Client ${entity.clientName} ${action}`;
        }
    }
});

const subClientWorkflow = new WorkflowService({
    workflowId: 155,
    Model: SubClient,
    entityType: 'SubClient',
    getNotificationMessage: (entity, action) => {
        switch(action) {
            case 'created':
                return `New sub-client registration under ${entity.mainClientId.clientName}`;
            case 'nextLevel':
                return `Sub-client verification moved to next level`;
            case 'approved':
                return `Sub-client has been approved`;
            case 'rejected':
                return `Sub-client has been rejected`;
            default:
                return `Sub-client ${action}`;
        }
    }
});
// Add this function at the top with other helper functions
async function generateNextClientCode() {
    try {
        // Find the highest existing client code
        const lastClient = await Client.findOne({}, { clientCode: 1 }, { sort: { clientCode: -1 } });
        
        let nextNum = 1;
        if (lastClient && lastClient.clientCode) {
            // Extract number from last code (SC001 -> 1)
            const lastNum = parseInt(lastClient.clientCode.replace('SC', ''));
            nextNum = lastNum + 1;
        }
        
        // Generate new code
        return `SC${String(nextNum).padStart(3, '0')}`;
    } catch (error) {
        throw new Error('Error generating client code: ' + error.message);
    }
}

async function generateSubClientCode(mainClientId) {
    try {
        // Find the main client
        const mainClient = await Client.findById(mainClientId);
        if (!mainClient) {
            throw new Error('Main client not found');
        }

        // Find the highest existing subclient code for this client
        const lastSubClient = await SubClient.findOne(
            { mainClientId: mainClientId },
            { subClientCode: 1 },
            { sort: { subClientCode: -1 } }
        );
        
        let nextNum = 1;
        if (lastSubClient && lastSubClient.subClientCode) {
            // Extract number from last code (e.g., SC001001 -> 1)
            const lastNum = parseInt(lastSubClient.subClientCode.slice(-3));
            nextNum = lastNum + 1;
        }
        
        // Generate new code (e.g., SC001001, SC001002, etc.)
        return `${mainClient.clientCode}${String(nextNum).padStart(3, '0')}`;
    } catch (error) {
        throw new Error('Error generating subclient code: ' + error.message);
    }
}

// Create new client
const createClient = async (req, res) => {
    try {
        const clientData = req.body;
        const clientCode = await generateNextClientCode();
        
        // Create entity through workflow
        const clientwithCode = {...clientData, clientCode};
        const result = await clientWorkflow.createEntity(clientwithCode, req.user, clientData.remarks);

        res.status(201).json({
            success: true,
            message: 'Client created successfully',
            data: result.entity
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Get clients for verification
const getClientsForVerification = async (req, res) => {
    try {
        const userRoleId = parseInt(req.query.userRoleId);
        if (isNaN(userRoleId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid userRoleId provided'
            });
        }

        const result = await clientWorkflow.getEntitiesForVerification(userRoleId);

        // Populate necessary references
        const populatedData = await Client.populate(result.data, [
            { path: 'accountingGroupId' }
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

// Update/verify client
const verifyClient = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        if (!remarks) {
            return res.status(400).json({
                success: false,
                message: "Remarks are required for verification"
            });
        }

        const result = await clientWorkflow.verifyEntity(id, req.user, remarks);

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

// Reject client
const rejectClient = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        if (!remarks) {
            return res.status(400).json({
                success: false,
                message: "Remarks are required for rejection"
            });
        }

        const client = await Client.findById(id);
        if (!client) {
            return res.status(404).json({
                success: false,
                message: 'Client not found'
            });
        }

        // Use workflow service for rejection
        const result = await clientWorkflow.rejectEntity(id, req.user, remarks);

        res.json({
            success: true,
            message: 'Client rejected successfully',
            data: result.data
        });

    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
};

const getActiveClients = async (req, res) => {
    try {
        // Get query parameters for pagination and filtering
        const { page = 1, limit = 10, search, gstNumber } = req.query;
        
        // Base query for active clients
        let query = {
            clientStatus: 'Active',
            status: 'Approved'
        };

        // Add search conditions if search parameter exists
        if (search) {
            query.$or = [
                { clientName: { $regex: search, $options: 'i' } },
                { clientCode: { $regex: search, $options: 'i' } },
                { mainGstNumber: { $regex: search, $options: 'i' } },
                { 'subClients.gstNumber': { $regex: search, $options: 'i' } }
            ];
        }

        // Add specific GST number filter if provided
        if (gstNumber) {
            query.$or = [
                { mainGstNumber: gstNumber },
                { 'subClients.gstNumber': gstNumber }
            ];
        }

        // Execute query with pagination
        const clients = await Client.find(query)
            .populate('accountingGroupId')
            .skip((page - 1) * limit)
            .limit(limit)
            .sort({ clientName: 1 });

        // Get total count for pagination
        const total = await Client.countDocuments(query);

        res.json({
            success: true,
            data: clients,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

const getActiveClientById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Valid client ID is required'
            });
        }

        const client = await Client.findOne({
            _id: id,
            clientStatus: 'Active',
            status: 'Approved'
        }).populate('accountingGroupId');

        if (!client) {
            return res.status(404).json({
                success: false,
                message: 'Active client not found'
            });
        }

        res.json({
            success: true,
            data: client
        });

    } catch (error) {
        console.error('Error in getActiveClientById:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// SubClient Controllers
const createSubClient = async (req, res) => {
    try {
        const subClientData = req.body;
        
        // Verify main client exists and is approved
        const mainClient = await Client.findOne({
            _id: subClientData.mainClientId,
            status: 'Approved',
            clientStatus: 'Active'
        });

        if (!mainClient) {
            return res.status(404).json({
                success: false,
                message: 'Main client not found or not approved'
            });
        }

        // Generate subclient code
        const subClientCode = await generateSubClientCode(subClientData.mainClientId);
        
        // Set state code from GST number if present
        const stateCode = subClientData.gstNumber ? 
            subClientData.gstNumber.substring(0, 2) : 
            subClientData.stateCode;

        // Validate no duplicate state GST for same main client
        const existingSubClient = await SubClient.findOne({
            mainClientId: subClientData.mainClientId,
            stateCode: stateCode,
        });
        
        if (existingSubClient) {
            return res.status(400).json({
                success: false,
                message: 'GST registration already exists for this state'
            });
        }

        // Add generated code and main client's accounting group
        const enrichedSubClientData = {
            ...subClientData,
            subClientCode,
            stateCode,
            accountingGroupId: mainClient.accountingGroupId
        };

        const result = await subClientWorkflow.createEntity(enrichedSubClientData, req.user, subClientData.remarks);

        res.status(201).json({
            success: true,
            message: 'Sub-client created successfully',
            data: result.entity
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// get subclient for verification
const getSubClientsForVerification = async (req, res) => {
    try {
        const userRoleId = parseInt(req.query.userRoleId);
        if (isNaN(userRoleId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid userRoleId provided'
            });
        }

        const result = await subClientWorkflow.getEntitiesForVerification(userRoleId);
        const populatedData = await SubClient.populate(result.data, [
            { path: 'mainClientId', select: 'clientName clientCode accountingGroupId' }
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
const verifySubClient = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        if (!remarks) {
            return res.status(400).json({
                success: false,
                message: "Remarks are required for verification"
            });
        }

        // Ensure complete population of mainClientId
        const subClient = await SubClient.findById(id)
            .populate({
                path: 'mainClientId',
                select: '_id clientName accountingGroupId levelId clientCode'
            });

        if (!subClient) {
            return res.status(404).json({
                success: false,
                message: 'Sub-client not found'
            });
        }

        // Validate mainClient data
        if (!subClient.mainClientId || !subClient.mainClientId._id) {
            return res.status(400).json({
                success: false,
                message: 'Main client data is missing or incomplete'
            });
        }

        console.log('Verification data:', {
            subClientId: subClient._id,
            subClientCode: subClient.subClientCode,
            mainClientData: subClient.mainClientId
        });

        const result = await subClientWorkflow.verifyEntity(id, req.user, remarks);

        // Process verification if approved
        if (result.data.status === 'Approved') {
            try {
                await processSubClientVerification(subClient);
            } catch (error) {
                return res.status(500).json({
                    success: false,
                    message: 'Error processing approval',
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            message: result.message,
            data: result.data
        });

    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message
        });
    }
};

const rejectSubClient = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        if (!remarks) {
            return res.status(400).json({
                success: false,
                message: "Remarks are required for rejection"
            });
        }

        const subClient = await SubClient.findById(id).populate({
            path: 'mainClientId',
            select: 'clientName'
        });

        if (!subClient) {
            return res.status(404).json({
                success: false,
                message: 'Sub-client not found'
            });
        }

        // Use workflow service for rejection
        const result = await subClientWorkflow.rejectEntity(id, req.user, remarks);

        res.json({
            success: true,
            message: 'Sub-client rejected successfully',
            data: result.data
        });

    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
};



async function createOpeningBalanceInvoice(mainClient, subClient, ccBalance, financialYear, balanceDate) {
    try {

        console.log('Creating invoice with data:', {
            mainClient,
            subClientCode:subClient.subClientCode,
            subClientId: subClient._id,
            ccBalance,
            financialYear
        });
        const costCentre = await CostCentre.findOne({ ccNo: ccBalance.ccCode });
        if (!costCentre) {
            throw new Error(`Cost Centre ${ccBalance.ccCode} not found`);
        }

        const invoice = new ClientInvoice({
            clientId: mainClient._id,
            clientName: mainClient.clientName,
            subClientId: subClient._id,
            subClientCode: subClient.subClientCode,
            gstNumber: subClient.gstNumber,
            ccCode: ccBalance.ccCode,
            ccName: costCentre.ccName,
            poNumber: 'OPENING_BALANCE',
            invoiceDate: balanceDate,
            dueDate: balanceDate,
            financialYear: financialYear,
            
            originalAmounts: {
                basicAmount: ccBalance.basicAmount,
                cgst: ccBalance.cgst,
                sgst: ccBalance.sgst,
                igst: ccBalance.igst
            },
            
            balances: {
                basicBalance: ccBalance.basicAmount,
                cgstBalance: ccBalance.cgst,
                sgstBalance: ccBalance.sgst,
                igstBalance: ccBalance.igst,
                totalBalance: ccBalance.total
            },

            approvalStatus: 'Approved',
            invoiceStatus: 'Submitted',
            levelId: mainClient.levelId,
            invoiceNumber: `OPENING_BAL_${subClient.subClientCode}_${ccBalance.ccCode}`
        });

        await invoice.save();
        return invoice;
    } catch (error) {
        console.error(`Error creating opening balance invoice for CC ${ccBalance.ccCode}:`, error);
        throw error;
    }
}


// Helper function to create ledger and invoices for sub-client
async function processSubClientVerification(subClient) {
    try {
        // Validate mainClient data first
        if (!subClient.mainClientId || !subClient.mainClientId._id) {
            throw new Error('Main client data is missing or incomplete');
        }

        const balanceDate = new Date(subClient.balanceAsOn);
        balanceDate.setUTCHours(0, 0, 0, 0);

        console.log('Main client data validation:', {
            mainClientId: subClient.mainClientId._id,
            mainClientName: subClient.mainClientId.clientName,
            accountingGroupId: subClient.mainClientId.accountingGroupId
        });

        // Create ledger entry for all approved sub-clients
        const ledgerEntry = new AccountsLedger({
            ledgerId: subClient._id,
            ledgerName: `${subClient.mainClientId.clientName} - ${subClient.subClientCode}`,
            groupId: subClient.mainClientId.accountingGroupId,
            openingBalance: subClient.hasOpeningBalance ? Math.abs(calculateTotalBalance(subClient.costCenterBalances)) : 0,
            balanceType: subClient.hasOpeningBalance && calculateTotalBalance(subClient.costCenterBalances) >= 0 ? 'Dr' : 'Cr',
            balanceAsOn: balanceDate,
            status: 'Approved',
            levelId: subClient.mainClientId.levelId
        });

        await ledgerEntry.save();
        console.log('Ledger entry created successfully');

        // Create invoices if has opening balance
        if (subClient.hasOpeningBalance && subClient.costCenterBalances?.length) {
            console.log('Processing cost center balances for invoices');
            
            const financialYear = getFinancialYear(subClient.balanceAsOn);
            let successCount = 0;
            let errorCount = 0;

            // Process each cost center balance sequentially
            for (const ccBalance of subClient.costCenterBalances) {
                console.log('Processing cost center:', ccBalance);

                // Validate cost center data
                if (!ccBalance.ccCode) {
                    console.error('Missing ccCode for cost center:', ccBalance);
                    errorCount++;
                    continue;
                }

                if (!ccBalance.ccName) {
                    console.error('Missing ccName for cost center:', ccBalance);
                    errorCount++;
                    continue;
                }

                try {
                    // Verify cost center exists
                    const costCentre = await CostCentre.findOne({ ccNo: ccBalance.ccCode });
                    if (!costCentre) {
                        console.error(`Cost Centre not found: ${ccBalance.ccCode}`);
                        errorCount++;
                        continue;
                    }

                    // Create invoice for this cost center
                    const invoice = await createOpeningBalanceInvoice(
                        subClient.mainClientId, // Populated main client data
                        subClient,
                        ccBalance,
                        financialYear,
                        balanceDate
                    );

                    console.log(`Invoice created successfully for CC: ${ccBalance.ccCode}`, {
                        invoiceId: invoice._id,
                        invoiceNumber: invoice.invoiceNumber
                    });
                    successCount++;

                } catch (error) {
                    console.error(`Error processing cost center ${ccBalance.ccCode}:`, error);
                    errorCount++;
                    continue;
                }
            }

            console.log('Cost center processing summary:', {
                total: subClient.costCenterBalances.length,
                successful: successCount,
                failed: errorCount
            });

            if (errorCount > 0) {
                console.warn(`${errorCount} cost centers failed to process`);
            }
        }

    } catch (error) {
        console.error('Error in processSubClientVerification:', {
            error,
            subClientCode: subClient?.subClientCode,
            mainClientId: subClient?.mainClientId?._id,
            message: error.message
        });
        throw error;
    }
}

function calculateTotalBalance(costCenterBalances) {
    return costCenterBalances.reduce((total, ccBalance) => {
        return total + (
            (ccBalance.basicAmount || 0) +
            (ccBalance.cgst || 0) +
            (ccBalance.sgst || 0) +
            (ccBalance.igst || 0)
        );
    }, 0);
}



async function createOpeningBalanceInvoice(
    mainClient,
    subClient, 
    ccBalance, 
    financialYear) {
    try {

        console.log('Creating invoice with data:', {
            ccCode: ccBalance.ccCode,
            ccName: ccBalance.ccName,
            mainClientId: mainClient._id,
            mainClientName: mainClient.clientName
        });




        const costCentre = await CostCentre.findOne({ ccNo: ccBalance.ccCode });
        if (!costCentre) {
            console.error(`Cost Centre not found for code: ${ccBalance.ccCode}`);
            throw new Error(`Cost Centre ${ccBalance.ccCode} not found`);
        }

        const invoice = new ClientInvoice({
            clientId: subClient.mainClientId._id,
            clientName: subClient.mainClientId.clientName,
            subClientId: subClient._id,
            subClientCode: subClient.subClientCode,
            gstNumber: subClient.gstNumber,
            ccCode: costCentre.ccNo,
            ccName: costCentre.ccName,
            poNumber: 'OPENING_BALANCE',
            invoiceDate: subClient.balanceAsOn,
            dueDate: subClient.balanceAsOn,
            financialYear: financialYear,
            
            originalAmounts: {
                basicAmount: ccBalance.basicAmount,
                cgst: ccBalance.cgst,
                sgst: ccBalance.sgst,
                igst: ccBalance.igst
            },
            
            balances: {
                basicBalance: ccBalance.basicAmount,
                cgstBalance: ccBalance.cgst,
                sgstBalance: ccBalance.sgst,
                igstBalance: ccBalance.igst,
                totalBalance: ccBalance.total
            },

            approvalStatus: 'Approved',
            invoiceStatus: 'Submitted',
            levelId: subClient.mainClientId.levelId,
            invoiceNumber: `OPENING_BAL_${subClient.subClientCode}_${ccBalance.ccCode}`
        });

        await invoice.save();
        return invoice;
    } catch (error) {
        console.error(`Error creating opening balance invoice for CC ${ccBalance.ccCode}:`, error);
        throw error;
    }
}


// Helper function for financial year
function getFinancialYear(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const nextYear = (year + 1).toString().slice(-2);
    const month = d.getMonth();
    
    if (month < 3) { // Before April
        const prevYear = year - 1;
        return `${prevYear}-${year.toString().slice(-2)}`;
    }
    return `${year}-${nextYear}`;
}



module.exports = {
    createClient,
    getClientsForVerification,
    verifyClient,
    rejectClient,
    getActiveClients,
    getActiveClientById,
    createSubClient,
    getSubClientsForVerification,
    verifySubClient,
    rejectSubClient


};