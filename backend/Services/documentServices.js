const mongoose = require('mongoose');
const { documentTypes } = require('../config/workflowConfig');

class DocumentService {
  static async getDocument(documentType, referenceId) {
    const config = documentTypes[documentType];
    if (!config) {
      throw new Error(`Invalid document type: ${documentType}`);
    }

    try {
      //  log the search attempt
      console.log(`Attempting to find ${documentType} with reference: ${referenceId}`);

      const searchQuery = this.buildSearchQuery(referenceId);
      console.log('Generated search query:', JSON.stringify(searchQuery, null, 2));

        // Parse the reference ID to extract month and year info
        const referenceInfo = this.parseReferenceNumber(referenceId);
        console.log('Parsed reference info:', referenceInfo);

      // Dynamically require the model
      const Model = mongoose.model(config.model);
      let document = await Model.findOne(searchQuery).lean();

      if (!document) {
        // If document not found, try with case-insensitive search
        const caseInsensitiveQuery = this.buildCaseInsensitiveQuery(searchQuery);
        document = await Model.findOne(caseInsensitiveQuery).lean();
        
        if (!document) {
          // Log available reference numbers for debugging
          const allDocs = await Model.find({}, { 
            offerNumber: 1, 
            opportunityNumber: 1,
            tenderNumber: 1 
          }).lean();
          
          console.log('Available references:', {
            offers: allDocs.map(d => d.offerNumber).filter(Boolean),
            opportunities: allDocs.map(d => d.opportunityNumber).filter(Boolean),
            tenders: allDocs.map(d => d.tenderNumber).filter(Boolean)
          });
          
          throw new Error(`${documentType} not found with reference: ${referenceId}`);
        }
        
      }

      console.log(`Document found with ID: ${document._id}`);

        const essentialPopulate = [
          {
            path:'businessOpportunity',
            select:'client tenderDetails descriptionOfWork submissionDate opportunityNumber businessCategory',
            populate:{
              path:'client',
              select:'name'
            }

          }
        ]
        const populateDoc = await Model.populate(document,essentialPopulate)
        

      return populateDoc;
      
    } catch (error) {
      if (error.message.includes('not found')) {
        throw error;
      }
      console.error('Error details:', {
        documentType,
        referenceId,
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Error fetching ${documentType}: ${error.message}`);
    }
  }
  static buildSearchQuery(referenceId) {
    const queries = [];

    // Check for offer number format (EPPL/EI/24/12/00003)
    if (/^EPPL\/EI\/\d{2}\/\d{2}\/\d{5}$/.test(referenceId)) {
      queries.push({ offerNumber: referenceId });
    }

    // Check for opportunity number format (EPPL/2024/0008)
    if (/^EPPL\/20\d{2}\/\d{4}$/.test(referenceId)) {
      queries.push({ 
        'businessOpportunity.opportunityNumber': referenceId,
        opportunityNumber: referenceId 
      });
    }

    // For tender number, we'll try multiple approaches since format is variable
    if (referenceId.length > 5) { // Basic validation to avoid very short strings
      queries.push(
        { tenderNumber: referenceId },
        { 'businessOpportunity.tenderDetails.tenderNumber': referenceId }
      );

      // If it looks like a number, also search numeric fields
      if (/^\d+$/.test(referenceId)) {
        queries.push(
          { tenderNumber: parseInt(referenceId) },
          { 'businessOpportunity.tenderDetails.tenderNumber': parseInt(referenceId) }
        );
      }
    }

    // If no specific format matched, search all fields
    if (queries.length === 0) {
      queries.push(
        { offerNumber: referenceId },
        { opportunityNumber: referenceId },
        { tenderNumber: referenceId },
        { 'businessOpportunity.opportunityNumber': referenceId },
        { 'businessOpportunity.tenderDetails.tenderNumber': referenceId }
      );
    }

    return { $or: queries };
  }

  
  static buildCaseInsensitiveQuery(query) {
    const transformValue = (value) => {
      if (typeof value === 'string') {
        return new RegExp('^' + value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i');
      }
      return value;
    };

    return {
      $or: query.$or.map(condition => {
        const newCondition = {};
        for (const [key, value] of Object.entries(condition)) {
          newCondition[key] = transformValue(value);
        }
        return newCondition;
      })
    };
  }


  static parseReferenceNumber(referenceId) {
    try {
      // Example format: EPPL/EI/24/12/00003
      const parts = referenceId.split('/');
      if (parts.length !== 5) {
        return null;
      }

      return {
        prefix: parts[0],
        department: parts[1],
        year: parts[2],
        month: parts[3],
        sequence: parts[4]
      };
    } catch (error) {
      console.error('Error parsing reference number:', error);
      return null;
    }
  }
  
  static generateNotFoundMessage(documentType, referenceId, referenceInfo) {
    if (!referenceInfo) {
      return `${documentType} not found with reference: ${referenceId}`;
    }

    return `${documentType} not found with reference: ${referenceId}. ` +
           `This appears to be a ${referenceInfo.month}/${referenceInfo.year} document with sequence number ${referenceInfo.sequence}. ` +
           `Please verify the reference number is correct.`;
  }
  
  static getDocumentReference(documentType, document) {
    try {
      const config = documentTypes[documentType];
      return document[config.primaryReferenceField] || null;
    } catch (error) {
      console.error('Error getting document reference:', error);
      return null;
    }
  }

  static formatResponse(documentType, { document, status, workflowProgress }) {
    if (!document) {
      throw new Error('Document is required for formatting response');
    }

    try {
      // Common response fields with proper null checks
      const baseResponse = {
        documentType,
        referenceId: this.getDocumentReference(documentType, document),
        status: status?.remarks || document.status || 'Pending',
        level: status?.levelId || null,
        currentRole: status?.roleId?.roleName || null,
        lastUpdated: status?.createdAt || null,
        lastUpdatedBy: status?.userName || null,
        workflow: workflowProgress || {
          totalSteps: 0,
          completedSteps: 0,
          remainingSteps: 0,
          percentage: 0
        }
      };

      // Add document-specific fields
      const specificFields = this.getSpecificFields(documentType, document);
      
      return {
        ...baseResponse,
        ...specificFields
      };
    } catch (error) {
      console.error('Error formatting response:', error);
      throw new Error(`Error formatting ${documentType} response: ${error.message}`);
    }
  }

  static getDocumentReference(documentType, document) {
    try {
      const config = documentTypes[documentType];
      return document[config.primaryReferenceField] || null;
    } catch (error) {
      console.error('Error getting document reference:', error);
      return null;
    }
  }

  static getSpecificFields(documentType, document) {
    try {
      switch (documentType) {
        case 'boq':
          return {
            amount: document.totalAmount || 0,
            originalAmount: document.originalAmount || 0,
            client: document.businessOpportunity?.client?.name || 'N/A',
            projectName: document.businessOpportunity?.tenderDetails?.tenderNumber || 'N/A',
            tenderNumber: document.tenderNumber || document.businessOpportunity?.tenderDetails?.tenderNumber || 'N/A',
            opportunityNumber: document.businessOpportunity?.opportunityNumber || 'N/A',
            workDescription: document.businessOpportunity?.descriptionOfWork || 'N/A',
            boqStatus: document.boqStatus || 'N/A',
            variationAcceptance: document.variationAcceptance || 0,
            totalItems: document.items?.length || 0,
            submissionDate: document.businessOpportunity?.submissionDate || 'N/A',
            businessCategory: document.businessOpportunity?.businessCategory || 'N/A'
          };
  

        case 'supplierPO':
          return {
            amount: document.totalAmount || 0,
            supplier: document.supplier?.name || 'N/A',
            deliveryDate: document.deliveryDate || null,
            costCentre: document.costCentre || 'N/A',
            documentStatus: document.status || 'Pending'
          };

        case 'indent':
          return {
            requestedBy: document.requestedBy?.userName || 'N/A',
            department: document.department || 'N/A',
            priority: document.priority || 'Normal',
            costCentre: document.costCentre || 'N/A',
            documentStatus: document.status || 'Pending'
          };

        default:
          return {};
      }
    } catch (error) {
      console.error('Error getting specific fields:', error);
      return {};
    }
  }
}

module.exports = DocumentService;