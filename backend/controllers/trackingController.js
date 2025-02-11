// controllers/trackingController.js

const TrackingService = require('../Services/trackingServices');
const natural = require('compromise');

class TrackingController {
  async processQuery(req, res) {
    try {
      const { query } = req.body;
      const { userId, roleId } = req.user;

      if (!query) {
        return res.status(400).json({
          success: false,
          message: 'Query is required'
        });
      }

      const doc = natural(query.toLowerCase());
      
      // Enhanced query type detection
      const isTrackingQuery = doc.match('(track|status|check|where|find|search|look|show)').found;
      const isReportQuery = doc.match('(what|how much|amount|balance|total|sum|value)').found;

      // First try to identify document type and reference
      let result;
      try {
        result = await this.identifyQueryType(query, doc, isTrackingQuery, isReportQuery);
      } catch (error) {
        return res.json({
          success: false,
          message: error.message,
          suggestions: this.getSuggestions(doc)
        });
      }

      if (result.type === 'tracking') {
        const status = await TrackingService.getDocumentStatus({
          documentType: result.documentType,
          referenceId: result.referenceId,
          userId,
          roleId
        });

        return res.json({
          success: true,
          type: 'tracking',
          data: status,
          message: `Found status for ${result.documentType}: ${result.referenceId}`
        });
      } 

      if (result.type === 'report') {
        return res.json({
          success: false,
          message: 'Report queries will be implemented soon',
          suggestions: [
            'Try tracking a document instead:',
            'Track BOQ EPPL/EI/24/11/00001',
            'Check status of PO-12345'
          ]
        });
      }

    } catch (error) {
      console.error('Query Processing Error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error processing query',
        suggestions: this.getSuggestions()
      });
    }
  }

  async getDocumentStatus(req, res) {
    try {
      const { documentType, referenceId } = req.params;
      const { userId, roleId } = req.user;

      if (!documentType || !referenceId) {
        return res.status(400).json({
          success: false,
          message: 'Document type and reference ID are required'
        });
      }

      const status = await TrackingService.getDocumentStatus({
        documentType,
        referenceId,
        userId,
        roleId
      });

      return res.json({
        success: true,
        data: status
      });

    } catch (error) {
      console.error('Status Check Error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error getting document status'
      });
    }
  }
  
  async identifyQueryType(originalQuery, doc, isTrackingQuery, isReportQuery) {
    // Enhanced document type patterns
    const extractedTypes = {
      'boq': {
        patterns: doc.match('(boq|tender|offer|quotation|bid)').found,
        refPatterns: [
          /EPPL\/EI\/\d{2}\/\d{2}\/\d{5}/,  // Offer number
          /EPPL\/\d{4}\/\d{4}/,             // Opportunity number
          /\d{10,}/                          // Tender number
        ]
      },
      'supplierPO': {
        patterns: doc.match('(supplier po|purchase order|vendor po|po number)').found,
        refPatterns: [
          /PO-\d+/,
          /EPPL\/PO\/\d{2}\/\d{5}/
        ]
      },
      'serviceProviderPO': {
        patterns: doc.match('(service po|service provider|sp po)').found,
        refPatterns: [/SP-\d+/, /EPPL\/SP\/\d{2}\/\d{5}/]
      },
      'indent': {
        patterns: doc.match('(indent|material request)').found,
        refPatterns: [/IND-\d+/, /EPPL\/IND\/\d{2}\/\d{5}/]
      },
      'itemCode': {
        patterns: doc.match('(item code|product code|material code)').found,
        refPatterns: [/[A-Z0-9]{10}/]
      }
    };

    // Find document type
    const documentType = Object.entries(extractedTypes).find(([_, config]) => config.patterns)?.[0];
    if (!documentType) {
      throw new Error('Could not identify document type. Please specify the type (BOQ, PO, etc.)');
    }

    // Find reference number using all patterns for the document type
    let referenceId = null;
    const config = extractedTypes[documentType];
    for (const pattern of config.refPatterns) {
      const match = originalQuery.match(pattern);
      if (match) {
        referenceId = match[0];
        break;
      }
    }

    if (!referenceId) {
      throw new Error(`Please provide a valid reference number for ${documentType}`);
    }

    return {
      type: isTrackingQuery ? 'tracking' : 'report',
      documentType,
      referenceId
    };
  }

  getSuggestions(doc) {
    return [
      'Track BOQ EPPL/EI/24/11/00001',
      'Check status of PO-12345',
      'Find indent IND-789',
      'Track item code 1MV001001'
    ];
  }
}

module.exports = new TrackingController();