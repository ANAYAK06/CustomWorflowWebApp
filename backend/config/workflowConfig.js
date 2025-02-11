// config/workflows.js
const mongoose = require('mongoose');
const workflowConfig = {
    documentTypes: {
      'boq': {
        workflowId: 146,
        pathId: 0,
        model: 'BOQ',
        searchFields: ['offerNumber', 'tenderNumber', 'opportunityNumber'],
        primaryReferenceField: 'offerNumber',
        isCostCentreApplicable: false,
        populate: [{
          path: 'businessOpportunity',
          populate: { path: 'client' }
        }]
      },
      'supplierPO': {
        workflowId: 100,
        pathId: 0,
        model: 'SupplierPO',
        searchFields: ['poNumber'],
        primaryReferenceField: 'poNumber',
        isCostCentreApplicable: true,
        populate: ['supplier']
      },
      'serviceProviderPO': {
        workflowId: 102,
        pathId: 0,
        model: 'ServiceProviderPO',
        searchFields: ['poNumber'],
        primaryReferenceField: 'poNumber',
        isCostCentreApplicable: true,
        populate: ['serviceProvider']
      },
      'indent': {
        workflowId: 122,
        pathId: 0,
        model: 'Indent',
        searchFields: ['indentNumber'],
        primaryReferenceField: 'indentNumber',
        isCostCentreApplicable: true,
        populate: ['requestedBy']
      },
      'itemCode': {
        workflowId: 149,
        pathId: 0,
        model: 'ItemCode',
        searchFields: ['itemCode'],
        primaryReferenceField: 'itemCode',
        isCostCentreApplicable: false
      }
    }
  };
  
  module.exports = workflowConfig;