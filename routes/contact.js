const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Contact = require('../models/Contact');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/contact
// @desc    Get all contact methods with dynamic sorting
// @access  Public
router.get('/', [
  query('sortBy').optional().isIn(['type', 'label', 'createdAt']).withMessage('Invalid sort field'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc')
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

    const { sortBy, sortOrder } = req.query;
    
    // Build filter object
    let filter = {};
    
    // Exclude website and social media types
    const excludedTypes = Contact.getExcludedTypes();
    filter.type = { $nin: excludedTypes };
    
    // Build sort object
    let sortObj = {};
    if (sortBy) {
      sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;
    } else {
      sortObj = { createdAt: -1 }; // Default sort by creation date descending
    }

    // Get contacts with filtering and sorting
    const contacts = await Contact.find(filter).sort(sortObj);

    res.json({
      success: true,
      data: contacts,
      meta: {
        total: contacts.length,
        sortBy: sortBy || 'createdAt',
        sortOrder: sortOrder || 'desc'
      }
    });

  } catch (error) {
    console.error('Get contact methods error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching contact methods'
    });
  }
});

// @route   GET /api/contact/:id
// @desc    Get single contact method
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact method not found'
      });
    }

    res.json({
      success: true,
      data: contact
    });

  } catch (error) {
    console.error('Get contact method error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid contact ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching contact method'
    });
  }
});

// @route   POST /api/contact
// @desc    Create new contact method
// @access  Private (Admin)
router.post('/', [
  adminAuth,
  body('type')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Type must be between 1 and 50 characters')
    .custom(value => {
      const excludedTypes = Contact.getExcludedTypes();
      if (excludedTypes.includes(value.toLowerCase())) {
        throw new Error('Website and social media contact types are not allowed');
      }
      return true;
    }),
  body('label')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Label must be between 1 and 100 characters'),
  body('value')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Value must be between 1 and 500 characters'),
  body('icon')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Icon name cannot exceed 50 characters')
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

    const { type, label, value, icon } = req.body;

    const contactData = {
      type,
      label,
      value
    };

    // Add optional fields
    if (icon) contactData.icon = icon;

    const contact = new Contact(contactData);
    await contact.save();

    res.status(201).json({
      success: true,
      message: 'Contact method created successfully',
      data: contact
    });

  } catch (error) {
    console.error('Create contact method error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating contact method'
    });
  }
});

// @route   PUT /api/contact/:id
// @desc    Update contact method
// @access  Private (Admin)
router.put('/:id', [
  adminAuth,
  body('type')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Type must be between 1 and 50 characters')
    .custom(value => {
      if (value) {
        const excludedTypes = Contact.getExcludedTypes();
        if (excludedTypes.includes(value.toLowerCase())) {
          throw new Error('Website and social media contact types are not allowed');
        }
      }
      return true;
    }),
  body('label')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Label must be between 1 and 100 characters'),
  body('value')
    .optional()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Value must be between 1 and 500 characters'),
  body('icon')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Icon name cannot exceed 50 characters')
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

    const contact = await Contact.findById(req.params.id);
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact method not found'
      });
    }

    const { type, label, value, icon } = req.body;

    // Update fields
    if (type) contact.type = type;
    if (label) contact.label = label;
    if (value) contact.value = value;
    if (icon !== undefined) contact.icon = icon;

    await contact.save();

    res.json({
      success: true,
      message: 'Contact method updated successfully',
      data: contact
    });

  } catch (error) {
    console.error('Update contact method error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid contact ID'
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
      message: 'Server error while updating contact method'
    });
  }
});

// @route   DELETE /api/contact/:id
// @desc    Delete contact method
// @access  Private (Admin)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact method not found'
      });
    }

    await Contact.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Contact method deleted successfully'
    });

  } catch (error) {
    console.error('Delete contact method error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid contact ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while deleting contact method'
    });
  }
});

module.exports = router;