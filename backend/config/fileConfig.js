const path = require('path');
const fs = require('fs');

const fileConfig = {
    // Base upload directory
    UPLOAD_BASE_DIR: 'public/uploads',

    // BOQ specific directories and configurations
    BOQ: {
        EXCEL_DIR: 'boq/excel',
        ATTACHMENTS_DIR: 'boq/attachments',
        ITEM_ATTACHMENTS_DIR: 'boq/item-attachments',
        ALLOWED_EXCEL_TYPES: [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ],
        ALLOWED_ATTACHMENT_TYPES: ['application/pdf'],
        MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
        MAX_ATTACHMENTS: 5,
        MAX_ITEM_ATTACHMENTS: 50
    },

    // Get absolute path for file operations
    getAbsolutePath: function(subDir) {
        return path.join(process.cwd(), this.UPLOAD_BASE_DIR, subDir);
    },

    // Get relative path for database storage
    getRelativePath: function(subDir, filename) {
        return path.join(this.UPLOAD_BASE_DIR, subDir, filename)
            .replace(/\\/g, '/');
    },

    // Get URL path for frontend access
    getUrlPath: function(subDir, filename) {
        return `/${this.UPLOAD_BASE_DIR}/${subDir}/${filename}`
            .replace(/\\/g, '/');
    },

    // Ensure directory exists
    ensureDirectory: function(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`Created directory: ${dirPath}`);
        }
    },

    // Initialize all required directories
    initializeDirectories: function() {
        [
            this.BOQ.EXCEL_DIR,
            this.BOQ.ATTACHMENTS_DIR,
            this.BOQ.ITEM_ATTACHMENTS_DIR
        ].forEach(dir => {
            const absolutePath = this.getAbsolutePath(dir);
            this.ensureDirectory(absolutePath);
        });
    }
};

// Initialize directories when config is loaded
fileConfig.initializeDirectories();

module.exports = fileConfig;