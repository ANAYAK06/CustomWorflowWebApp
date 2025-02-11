// registrations/boqRegistration.js
const ClientBOQ = require('../ProjectModule/models/clientBOQSchema');

const registerBOQTracking = (trackingService) => {
    trackingService.registerDocumentType({
        documentType: 'clientBOQ',
        model: ClientBOQ,
        workflowId: 153,
        searchStrategies: {
            offerNumber: (value) => ({ offerNumber: value }),
            tenderNumber: (value) => ({ tenderNumber: value }),
            opportunityNumber: (value) => ({ opportunityNumber: value }),
            clientName: (value) => ({ name: new RegExp(value, 'i') })
        },
        statusFormatter: ({ document, signatureHistory, currentStatus, workflowDetails }) => ({
            documentId: document._id,
            documentType: 'clientBOQ',
            basicInfo: {
                offerNumber: document.offerNumber,
                tenderNumber: document.tenderNumber,
                opportunityNumber: document.opportunityNumber,
                clientName: document.name
            },
            currentStatus,
            workflowName: workflowDetails.workflowname,
            history: signatureHistory
        })
    });
};

module.exports = registerBOQTracking;