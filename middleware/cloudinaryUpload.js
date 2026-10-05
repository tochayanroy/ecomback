const multer = require('multer');
const cloudinary = require('../config/cloudinary');


const storage = multer.memoryStorage();

const imageFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

const profileUpload = multer({
    storage,
    fileFilter: imageFilter,
    limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5MB
});

const uploadUserProfile = profileUpload.single('profileImage');


const uploadBufferToCloudinary = (buffer, options = {}) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
            if (error) return reject(error);
            resolve(result);
        });
        stream.end(buffer);
    });
};


const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
    if (!publicId) return false;
    try {
        const result = await cloudinary.uploader.destroy(publicId, {
            resource_type: resourceType,
            invalidate: true,
        });
        return result.result === 'ok';
    } catch (error) {
        console.error('Cloudinary delete error:', error);
        return false;
    }
};


const extractPublicId = (url) => {
    if (!url) return null;
    try {
        const parts = url.split('/upload/');
        if (parts.length < 2) return null;
        const afterUpload = parts[1]; // v1234/folder/file.jpg
        const withoutVersion = afterUpload.replace(/^v\d+\//, ''); 
        const publicId = withoutVersion.replace(/\.[^/.]+$/, '');
        return publicId;
    } catch {
        return null;
    }
};

const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'File too large. Maximum size is 5MB.',
            });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                success: false,
                error: 'Unexpected field name. Use "profileImage".',
            });
        }
        return res.status(400).json({ success: false, error: err.message });
    } else if (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
    next();
};

module.exports = {
    uploadUserProfile,
    handleMulterError,
    uploadBufferToCloudinary,
    deleteFromCloudinary,
    extractPublicId,
};