const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Certificate = require('../models/Certificate');
const { adminAuth } = require('../middleware/auth');
const { uploadCertificate, deleteImage, extractPublicId } = require('../config/cloudinary');

const router = express.Router();

// @route   GET /api/certificates
// @desc    Get all certificates with filtering and pagination
// @access  Public
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('category').optional().isIn(['quality', 'organic', 'safety', 'environmental', 'other']).withMessage('Invalid category'),
  query('search').optional().isLength({ max: 100 }).withMessage('Search term too long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { category, search, isActive } = req.query;

    // Build filter object
    let filter = {};
    
    if (category) {
      filter.category = category;
    }
    
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }
    
    if (search) {
      filter.$text = { $search: search };
    }

    // Get certificates with pagination
    const certificates = await Certificate.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const total = await Certificate.countDocuments(filter);

    res.json({
      success: true,
      data: certificates,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit
      }
    });

  } catch (error) {
    console.error('Get certificates error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching certificates'
    });
  }
});

// @route   GET /api/certificates/:id
// @desc    Get single certificate
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const certificate = await Certificate.findById(req.params.id);
    
    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found'
      });
    }

    res.json({
      success: true,
      data: certificate
    });

  } catch (error) {
    console.error('Get certificate error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid certificate ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching certificate'
    });
  }
});

// @route   POST /api/certificates
// @desc    Create new certificate
// @access  Private (Admin)
router.post('/', [
  adminAuth,
  uploadCertificate.single('image'),
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Certificate name must be between 1 and 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Description must be between 1 and 1000 characters'),
  body('category')
    .optional()
    .isIn(['quality', 'organic', 'safety', 'environmental', 'other'])
    .withMessage('Invalid category'),
  body('issuer')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Issuer name cannot exceed 100 characters'),
  body('certificateNumber')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Certificate number cannot exceed 50 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, description, category, issuer, certificateNumber, issueDate, expiryDate, documentUrl } = req.body;

    // Check if image was uploaded or URL provided
    let imageUrl, imagePublicId;
    
    if (req.file) {
      imageUrl = req.file.path;
      imagePublicId = req.file.filename;
    } else if (req.body.imageUrl) {
      imageUrl = req.body.imageUrl;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Certificate image is required'
      });
    }

    const certificateData = {
      name,
      description,
      image: imageUrl,
      imagePublicId
    };

    // Add optional fields
    if (category) certificateData.category = category;
    if (issuer) certificateData.issuer = issuer;
    if (certificateNumber) certificateData.certificateNumber = certificateNumber;
    if (issueDate) certificateData.issueDate = new Date(issueDate);
    if (expiryDate) certificateData.expiryDate = new Date(expiryDate);
    if (documentUrl) certificateData.documentUrl = documentUrl;

    const certificate = new Certificate(certificateData);
    await certificate.save();

    res.status(201).json({
      success: true,
      message: 'Certificate created successfully',
      data: certificate
    });

  } catch (error) {
    console.error('Create certificate error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating certificate'
    });
  }
});

// @route   PUT /api/certificates/:id
// @desc    Update certificate
// @access  Private (Admin)
router.put('/:id', [
  adminAuth,
  uploadCertificate.single('image'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Certificate name must be between 1 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Description must be between 1 and 1000 characters'),
  body('category')
    .optional()
    .isIn(['quality', 'organic', 'safety', 'environmental', 'other'])
    .withMessage('Invalid category'),
  body('issuer')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Issuer name cannot exceed 100 characters'),
  body('certificateNumber')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Certificate number cannot exceed 50 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const certificate = await Certificate.findById(req.params.id);
    
    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found'
      });
    }

    const { name, description, category, issuer, certificateNumber, issueDate, expiryDate, documentUrl, isActive } = req.body;

    // Handle image update
    if (req.file) {
      // Delete old image if it exists and was uploaded to Cloudinary
      if (certificate.imagePublicId) {
        try {
          await deleteImage(certificate.imagePublicId);
        } catch (error) {
          console.error('Error deleting old image:', error);
        }
      }
      
      certificate.image = req.file.path;
      certificate.imagePublicId = req.file.filename;
    } else if (req.body.imageUrl && req.body.imageUrl !== certificate.image) {
      // Delete old image if switching to URL
      if (certificate.imagePublicId) {
        try {
          await deleteImage(certificate.imagePublicId);
        } catch (error) {
          console.error('Error deleting old image:', error);
        }
      }
      
      certificate.image = req.body.imageUrl;
      certificate.imagePublicId = undefined;
    }

    // Update fields
    if (name) certificate.name = name;
    if (description) certificate.description = description;
    if (category) certificate.category = category;
    if (issuer) certificate.issuer = issuer;
    if (certificateNumber) certificate.certificateNumber = certificateNumber;
    if (issueDate) certificate.issueDate = new Date(issueDate);
    if (expiryDate) certificate.expiryDate = new Date(expiryDate);
    if (documentUrl) certificate.documentUrl = documentUrl;
    if (isActive !== undefined) certificate.isActive = isActive === 'true';

    await certificate.save();

    res.json({
      success: true,
      message: 'Certificate updated successfully',
      data: certificate
    });

  } catch (error) {
    console.error('Update certificate error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid certificate ID'
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating certificate'
    });
  }
});

// @route   DELETE /api/certificates/:id
// @desc    Delete certificate
// @access  Private (Admin)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const certificate = await Certificate.findById(req.params.id);
    
    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found'
      });
    }

    // Delete image from Cloudinary if it exists
    if (certificate.imagePublicId) {
      try {
        await deleteImage(certificate.imagePublicId);
      } catch (error) {
        console.error('Error deleting image:', error);
      }
    }

    await Certificate.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Certificate deleted successfully'
    });

  } catch (error) {
    console.error('Delete certificate error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid certificate ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while deleting certificate'
    });
  }
});

module.exports = router;