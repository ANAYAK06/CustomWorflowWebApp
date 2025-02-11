const SignatureAndRemarks = require('../models/signatureAndRemarksmodel');
const Permission = require('../models/permissionModel');
const UserRole = require('../models/userRolesModel');
const UserCostCentre = require('../models/userCostCentres');
const Users = require('../models/usersModel');
const DocumentService = require('../Services/documentServices');
const { documentTypes } = require('../config/workflowConfig');

class TrackingService { 
  async getDocumentStatus({
    documentType,
    referenceId,
    userId,
    roleId
  }) {
    try {
      // 1. Validate document type
      if (!documentTypes[documentType]) {
        throw new Error(`Invalid document type: ${documentType}`);
      }

      // 2. Verify access
      await this.verifyAccess({
        documentType,
        userId,
        roleId
      });

      // 3. Get document details
      const documentDetails = await DocumentService.getDocument(documentType, referenceId);
      if (!documentDetails) {
        throw new Error(`${documentType} not found with reference: ${referenceId}`);
      }

      // 4. Get all signatures for this document
      const signatures = await SignatureAndRemarks.find({ 
        relatedEntityId: documentDetails._id 
      })
      .sort({ createdAt: -1 })
      .populate({
        path: 'userId',
        model: Users,
        select: 'userName'
      })
      .lean();
      // handle roleId separately since its a number
      if(signatures && signatures.length > 0) { 
        //get all unique roleIds
        const roleIds = [...new Set(signatures.map(sig => sig.roleId))];
        // fetch all relevant roles in one query
        const roles = await UserRole.find({ roleId: { $in: roleIds } })
        .select('roleId roleName')
        .lean();
        // create map for quick lookup
        const roleMap = new Map(roles.map(role => [role.roleId, role ]));

      // add role information to signature
      signatures.forEach(sig => {

        const role = roleMap.get(sig.roleId);
        sig.role = role ? {roleName: role.roleName}: 'Unknown Role';
      });
    }

      // Get workflow config
      const workflowConfig = documentTypes[documentType];
      
      // Calculate workflow progress
      const workflowProgress = await this.calculateWorkflowProgress(
        signatures || [], 
        workflowConfig.workflowId
      );

      // 5. Format and return response
      return DocumentService.formatResponse(documentType, {
        document: documentDetails,
        status: signatures && signatures.length > 0 ? signatures[0] : null,
        workflowProgress
      });
    } catch (error) {
      console.error('Document Status Error:', error);
      throw error;
    }
  }

  async calculateWorkflowProgress(signatures, workflowId) {
    try {
      // Get workflow steps from Permission model
      const workflow = await Permission.findOne({ workflowId });
      if (!workflow || !workflow.workflowDetails) {
        console.log('No workflow or workflow details found');
        return {
          totalSteps: 0,
          completedSteps: 0,
          remainingSteps: 0,
          percentage: 0
        };
      }

      const totalSteps = workflow.workflowDetails.length;
      const completedSteps = Array.isArray(signatures) ? signatures.length : 0;
      
      return {
        totalSteps,
        completedSteps,
        remainingSteps: totalSteps - completedSteps,
        percentage: Math.round((completedSteps / totalSteps) * 100)
      };
    } catch (error) {
      console.error('Error calculating workflow progress:', error);
      return {
        totalSteps: 0,
        completedSteps: 0,
        remainingSteps: 0,
        percentage: 0
      };
    }
  }

  async verifyAccess({ documentType, userId, roleId }) {
    try {
      const workflowId = documentTypes[documentType].workflowId;

      // 1. Check workflow permission
      const permission = await Permission.findOne({ workflowId });
      if (!permission) {
        return false;
      }

      // 2. Check role permission
      const hasRoleAccess = permission.workflowDetails && permission.workflowDetails.some(
        detail => detail.roleId === roleId
      );
      if (!hasRoleAccess) {
        return false;
      }

      // 3. Check cost centre applicability if specified in workflow
      if (documentTypes[documentType].isCostCentreApplicable) {
        const userRole = await UserRole.findOne({ roleId });
        if (userRole?.isCostCentreApplicable) {
          const userCC = await UserCostCentre.findOne({ userId, roleId });
          if (!userCC) {
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      console.error('Access Verification Error:', error);
      throw error;
    }
  }
}

module.exports = new TrackingService();