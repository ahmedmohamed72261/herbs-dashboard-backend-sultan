const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Message = require('../models/Message');
const { adminAuth, auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/messages
// @desc    Get all messages with filtering and pagination (Admin only)
// @access  Private (Admin)
router.get('/', [
  adminAuth,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('category').optional().isIn(['general', 'support', 'sales', 'partnership', 'complaint', 'other']).withMessage('Invalid category'),
  query('priority').optional().isIn(['low', 'medium', 'high']).withMessage('Invalid priority'),
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
    const { category, priority, search, isRead, replied } = req.query;

    // Build filter object
    let filter = {};
    
    if (category) {
      filter.category = category;
    }
    
    if (priority) {
      filter.priority = priority;
    }
    
    if (isRead !== undefined) {
      filter.isRead = isRead === 'true';
    }
    
    if (replied !== undefined) {
      filter.replied = replied === 'true';
    }
    
    if (search) {
      filter.$text = { $search: search };
    }

    // Get messages with pagination
    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('notes.addedBy', 'email');

    // Get total count for pagination
    const total = await Message.countDocuments(filter);

    // Get statistics
    const stats = await Message.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          unread: { $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] } },
          unreplied: { $sum: { $cond: [{ $eq: ['$replied', false] }, 1, 0] } },
          highPriority: { $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] } }
        }
      }
    ]);

    res.json({
      success: true,
      data: messages,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit
      },
      stats: stats[0] || { total: 0, unread: 0, unreplied: 0, highPriority: 0 }
    });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching messages'
    });
  }
});

// @route   GET /api/messages/:id
// @desc    Get single message (Admin only)
// @access  Private (Admin)
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id)
      .populate('notes.addedBy', 'email');
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Mark as read if not already read
    if (!message.isRead) {
      message.isRead = true;
      message.readAt = new Date();
      await message.save();
    }

    res.json({
      success: true,
      data: message
    });

  } catch (error) {
    console.error('Get message error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching message'
    });
  }
});

// @route   POST /api/messages
// @desc    Create new message (Public - from contact form)
// @access  Public
router.post('/', [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('subject')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Subject must be between 1 and 200 characters'),
  body('message')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Message must be between 1 and 2000 characters'),
  body('phone')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Phone number cannot exceed 20 characters'),
  body('category')
    .optional()
    .isIn(['general', 'support', 'sales', 'partnership', 'complaint', 'other'])
    .withMessage('Invalid category')
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

    const { name, email, phone, subject, message, category } = req.body;

    const messageData = {
      name,
      email,
      subject,
      message,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    };

    // Add optional fields
    if (phone) messageData.phone = phone;
    if (category) messageData.category = category;

    // Auto-assign priority based on keywords
    const highPriorityKeywords = ['urgent', 'emergency', 'complaint', 'problem', 'issue', 'error'];
    const messageText = (subject + ' ' + message).toLowerCase();
    
    if (highPriorityKeywords.some(keyword => messageText.includes(keyword))) {
      messageData.priority = 'high';
    } else if (category === 'complaint') {
      messageData.priority = 'high';
    } else if (category === 'sales' || category === 'partnership') {
      messageData.priority = 'medium';
    }

    const newMessage = new Message(messageData);
    await newMessage.save();

    res.status(201).json({
      success: true,
      message: 'Message sent successfully. We will get back to you soon!',
      data: {
        id: newMessage._id,
        name: newMessage.name,
        subject: newMessage.subject,
        createdAt: newMessage.createdAt
      }
    });

  } catch (error) {
    console.error('Create message error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while sending message'
    });
  }
});

// @route   PUT /api/messages/:id
// @desc    Update message status (Admin only)
// @access  Private (Admin)
router.put('/:id', [
  adminAuth,
  body('isRead')
    .optional()
    .isBoolean()
    .withMessage('isRead must be a boolean'),
  body('replied')
    .optional()
    .isBoolean()
    .withMessage('replied must be a boolean'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high'])
    .withMessage('Invalid priority'),
  body('category')
    .optional()
    .isIn(['general', 'support', 'sales', 'partnership', 'complaint', 'other'])
    .withMessage('Invalid category')
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

    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    const { isRead, replied, priority, category } = req.body;

    // Update fields
    if (isRead !== undefined) {
      message.isRead = isRead;
      if (isRead && !message.readAt) {
        message.readAt = new Date();
      }
    }
    
    if (replied !== undefined) {
      message.replied = replied;
      if (replied && !message.repliedAt) {
        message.repliedAt = new Date();
      }
    }
    
    if (priority) message.priority = priority;
    if (category) message.category = category;

    await message.save();

    res.json({
      success: true,
      message: 'Message updated successfully',
      data: message
    });

  } catch (error) {
    console.error('Update message error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID'
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
      message: 'Server error while updating message'
    });
  }
});

// @route   POST /api/messages/:id/notes
// @desc    Add note to message (Admin only)
// @access  Private (Admin)
router.post('/:id/notes', [
  adminAuth,
  body('content')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Note content must be between 1 and 500 characters')
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

    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    const { content } = req.body;

    message.notes.push({
      content,
      addedBy: req.user._id,
      addedAt: new Date()
    });

    await message.save();
    await message.populate('notes.addedBy', 'email');

    res.json({
      success: true,
      message: 'Note added successfully',
      data: message
    });

  } catch (error) {
    console.error('Add note error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while adding note'
    });
  }
});

// @route   DELETE /api/messages/:id
// @desc    Delete message (Admin only)
// @access  Private (Admin)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    await Message.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });

  } catch (error) {
    console.error('Delete message error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while deleting message'
    });
  }
});

// @route   PUT /api/messages/:id/mark-read
// @desc    Mark message as read (Admin only)
// @access  Private (Admin)
router.put('/:id/mark-read', adminAuth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    if (!message.isRead) {
      message.isRead = true;
      message.readAt = new Date();
      await message.save();
    }

    res.json({
      success: true,
      message: 'Message marked as read',
      data: message
    });

  } catch (error) {
    console.error('Mark read error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while marking message as read'
    });
  }
});

module.exports = router;