const fs = require('fs').promises;
const path = require('path');
const fileConfig = require('../config/fileConfig');

async function setupUploadDirectories() {
    const directories = [
        fileConfig.getAbsolutePath(fileConfig.BOQ.EXCEL_DIR),
        fileConfig.getAbsolutePath(fileConfig.BOQ.ATTACHMENTS_DIR),
        fileConfig.getAbsolutePath(fileConfig.BOQ.ITEM_ATTACHMENTS_DIR) // Added new directory
    ];

    for (const dir of directories) {
        try {
            await fs.mkdir(dir, { recursive: true });
            console.log(`Created directory: ${dir}`);
        } catch (error) {
            if (error.code !== 'EEXIST') {
                console.error(`Error creating directory ${dir}:`, error);
            }
        }
    }
}

// Run if called directly
if (require.main === module) {
    setupUploadDirectories().then(() => {
        console.log('Upload directories setup complete');
    }).catch(console.error);
}

module.exports = setupUploadDirectories;