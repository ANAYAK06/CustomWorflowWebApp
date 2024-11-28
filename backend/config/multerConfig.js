const multer = require('multer');
const path = require('path');
const fileConfig = require('./fileConfig');

// Storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadDir;
        switch (file.fieldname) {
            case 'excelFile':
                uploadDir = fileConfig.getAbsolutePath(fileConfig.BOQ.EXCEL_DIR);
                break;
            case 'attachments':
                uploadDir = fileConfig.getAbsolutePath(fileConfig.BOQ.ATTACHMENTS_DIR);
                break;
            case 'itemAttachments':
                uploadDir = fileConfig.getAbsolutePath(fileConfig.BOQ.ITEM_ATTACHMENTS_DIR);
                break;
            default:
                return cb(new Error('Invalid field name'));
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter
const fileFilter = (req, file, cb) => {
    switch (file.fieldname) {
        case 'excelFile':
            if (fileConfig.BOQ.ALLOWED_EXCEL_TYPES.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('Invalid excel file type'));
            }
            break;
        case 'attachments':
        case 'itemAttachments':
            if (fileConfig.BOQ.ALLOWED_ATTACHMENT_TYPES.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('Invalid attachment file type'));
            }
            break;
        default:
            cb(new Error('Invalid field name'));
    }
};

// Create multer upload instance
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: fileConfig.BOQ.MAX_FILE_SIZE
    }
}).fields([
    { name: 'excelFile', maxCount: 1 },
    { name: 'attachments', maxCount: fileConfig.BOQ.MAX_ATTACHMENTS },
    { name: 'itemAttachments', maxCount: fileConfig.BOQ.MAX_ITEM_ATTACHMENTS }
]);

// Export the configured multer middleware
module.exports = {
    upload
};