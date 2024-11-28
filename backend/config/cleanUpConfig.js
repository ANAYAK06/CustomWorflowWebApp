const fs = require('fs').promises;
const path = require('path');
const fileConfig = require('../config/fileConfig');

/**
 * Safely delete a file if it exists
 * @param {string} filePath - Path to the file
 * @returns {Promise<void>}
 */
const safeDeleteFile = async (filePath) => {
    try {
        await fs.access(filePath); // Check if file exists
        await fs.unlink(filePath);
        console.log(`Successfully deleted file: ${filePath}`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`File doesn't exist, skipping deletion: ${filePath}`);
        } else {
            console.error(`Error deleting file ${filePath}:`, error);
        }
    }
};

/**
 * Clean up uploaded files in case of error
 * @param {Object} files - Object containing uploaded files from multer
 * @param {boolean} isError - Whether this is being called due to an error
 * @returns {Promise<void>}
 */
const cleanupFiles = async (files, isError = true) => {
    try {
        if (!files) return;

        const filesToDelete = [];

        // Only collect files for deletion if there was an error
        if (isError) {
            // Handle excel file
            if (files.excelFile?.[0]) {
                filesToDelete.push(files.excelFile[0].path);
            }

            // Handle attachments
            if (files.attachments) {
                files.attachments.forEach(file => {
                    filesToDelete.push(file.path);
                });
            }

            // Handle item attachments
            if (files.itemAttachments) {
                files.itemAttachments.forEach(file => {
                    filesToDelete.push(file.path);
                });
            }

            // Log files that will be deleted
            console.log('Files to be cleaned up:', filesToDelete);

            // Delete files
            for (const filePath of filesToDelete) {
                await safeDeleteFile(filePath);
            }
        }

    } catch (error) {
        console.error('Error in cleanupFiles:', error);
        // Don't throw the error as this is a cleanup function
    }
};

module.exports = { cleanupFiles, safeDeleteFile };