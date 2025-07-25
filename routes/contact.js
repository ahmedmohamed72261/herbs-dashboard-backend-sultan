const express = require('express');
const { body, validationResult } = require('express-validator');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();

// Mock contact methods data (in a real app, this would be stored in database)
let contactMethods = [
  {
    id: 1,
    type: 'phone',
    label: 'Phone',
    value: '+1 (555) 123-4567',
    description: 'Call us during business hours',
    isActive: true,
    order: 1
  },
  {
    id: 2,
    type: 'whatsapp',
    label: 'WhatsApp',
    value: '+1 (555) 123-4567',
    description: 'Message us on WhatsApp',
    isActive: true,
    order: 2
  },
  {
    id: 3,
    type: 'email',
    label: 'Email',
    value: 'info@herbs.com',
    description: 'Send us an email',
    isActive: true,
    order: 3
  },
  {
    id: 4,
    type: 'address',
    label: 'Address',
    value: '123 Herbs Street, Natural City, NC 12345',
    description: 'Visit our store',
    isActive: true,
    order: 4
  },
  {
    id: 5,
    type: 'website',
    label: 'Website',
    value: 'https://herbs.com',
    description: 'Visit our website',
    isActive: true,
    order: 5
  },
  {
    id: 6,
    type: 'social',
    label: 'Facebook',
    value: 'https://facebook.com/herbs',
    description: 'Follow us on Facebook',
    isActive: true,
    order: 6
  }
];

// @route   GET /api/contact
// @desc    Get all contact methods
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { isActive } = req.query;
    
    let filteredMethods = contactMethods;
    
    if (isActive !== undefined) {
      filteredMethods = contactMethods.filter(method => 
        method.isActive === (isActive === 'true')
      );
    }
    
    // Sort by order
    filteredMethods.sort((a, b) => a.order - b.order);

    res.json({
      success: true,
      data: filteredMethods
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
    const contactMethod = contactMethods.find(method => method.id === parseInt(req.params.id));
    
    if (!contactMethod) {
      return res.status(404).json({
        success: false,
        message: 'Contact method not found'
      });
    }

    res.json({
      success: true,
      data: contactMethod
    });

  } catch (error) {
    console.error('Get contact method error:', error);
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
    .withMessage('Type must be between 1 and 50 characters'),
  body('label')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Label must be between 1 and 100 characters'),
  body('value')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Value must be between 1 and 500 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Description cannot exceed 200 characters'),
  body('order')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Order must be a positive integer')
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

    const { type, label, value, description, isActive, order } = req.body;

    // Generate new ID
    const newId = Math.max(...contactMethods.map(m => m.id), 0) + 1;

    const newContactMethod = {
      id: newId,
      type,
      label,
      value,
      description: description || '',
      isActive: isActive !== undefined ? isActive : true,
      order: order || newId
    };

    contactMethods.push(newContactMethod);

    res.status(201).json({
      success: true,
      message: 'Contact method created successfully',
      data: newContactMethod
    });

  } catch (error) {
    console.error('Create contact method error:', error);
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
    .withMessage('Type must be between 1 and 50 characters'),
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
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Description cannot exceed 200 characters'),
  body('order')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Order must be a positive integer')
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

    const contactMethodIndex = contactMethods.findIndex(method => method.id === parseInt(req.params.id));
    
    if (contactMethodIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Contact method not found'
      });
    }

    const { type, label, value, description, isActive, order } = req.body;

    // Update fields
    if (type) contactMethods[contactMethodIndex].type = type;
    if (label) contactMethods[contactMethodIndex].label = label;
    if (value) contactMethods[contactMethodIndex].value = value;
    if (description !== undefined) contactMethods[contactMethodIndex].description = description;
    if (isActive !== undefined) contactMethods[contactMethodIndex].isActive = isActive;
    if (order) contactMethods[contactMethodIndex].order = order;

    res.json({
      success: true,
      message: 'Contact method updated successfully',
      data: contactMethods[contactMethodIndex]
    });

  } catch (error) {
    console.error('Update contact method error:', error);
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
    const contactMethodIndex = contactMethods.findIndex(method => method.id === parseInt(req.params.id));
    
    if (contactMethodIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Contact method not found'
      });
    }

    contactMethods.splice(contactMethodIndex, 1);

    res.json({
      success: true,
      message: 'Contact method deleted successfully'
    });

  } catch (error) {
    console.error('Delete contact method error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting contact method'
    });
  }
});

// @route   PUT /api/contact/:id/toggle
// @desc    Toggle contact method active status
// @access  Private (Admin)
router.put('/:id/toggle', adminAuth, async (req, res) => {
  try {
    const contactMethodIndex = contactMethods.findIndex(method => method.id === parseInt(req.params.id));
    
    if (contactMethodIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Contact method not found'
      });
    }

    contactMethods[contactMethodIndex].isActive = !contactMethods[contactMethodIndex].isActive;

    res.json({
      success: true,
      message: `Contact method ${contactMethods[contactMethodIndex].isActive ? 'activated' : 'deactivated'} successfully`,
      data: contactMethods[contactMethodIndex]
    });

  } catch (error) {
    console.error('Toggle contact method error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while toggling contact method'
    });
  }
});

// @route   PUT /api/contact/reorder
// @desc    Reorder contact methods
// @access  Private (Admin)
router.put('/reorder', [
  adminAuth,
  body('orders')
    .isArray()
    .withMessage('Orders must be an array'),
  body('orders.*.id')
    .isInt()
    .withMessage('Each order item must have a valid ID'),
  body('orders.*.order')
    .isInt({ min: 1 })
    .withMessage('Each order item must have a valid order number')
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

    const { orders } = req.body;

    // Update order for each contact method
    orders.forEach(orderItem => {
      const contactMethodIndex = contactMethods.findIndex(method => method.id === orderItem.id);
      if (contactMethodIndex !== -1) {
        contactMethods[contactMethodIndex].order = orderItem.order;
      }
    });

    // Sort by new order
    contactMethods.sort((a, b) => a.order - b.order);

    res.json({
      success: true,
      message: 'Contact methods reordered successfully',
      data: contactMethods
    });

  } catch (error) {
    console.error('Reorder contact methods error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while reordering contact methods'
    });
  }
});

module.exports = router;