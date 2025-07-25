const express = require('express');
const { body, validationResult, query } = require('express-validator');
const TeamMember = require('../models/TeamMember');
const { adminAuth } = require('../middleware/auth');
const { uploadTeam, deleteImage, extractPublicId } = require('../config/cloudinary');

const router = express.Router();

// @route   GET /api/team
// @desc    Get all team members with filtering and pagination
// @access  Public
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('department').optional().isLength({ max: 50 }).withMessage('Department filter too long'),
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
    const { department, search, isActive } = req.query;

    // Build filter object
    let filter = {};
    
    if (department) {
      filter.department = new RegExp(department, 'i');
    }
    
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }
    
    if (search) {
      filter.$text = { $search: search };
    }

    // Get team members with pagination
    const teamMembers = await TeamMember.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const total = await TeamMember.countDocuments(filter);

    res.json({
      success: true,
      data: teamMembers,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit
      }
    });

  } catch (error) {
    console.error('Get team members error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching team members'
    });
  }
});

// @route   GET /api/team/:id
// @desc    Get single team member
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const teamMember = await TeamMember.findById(req.params.id);
    
    if (!teamMember) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    res.json({
      success: true,
      data: teamMember
    });

  } catch (error) {
    console.error('Get team member error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid team member ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching team member'
    });
  }
});

// @route   POST /api/team
// @desc    Create new team member
// @access  Private (Admin)
router.post('/', [
  adminAuth,
  uploadTeam.single('image'),
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  body('position')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Position must be between 1 and 100 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('phone')
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Phone number must be between 1 and 20 characters'),
  body('whatsapp')
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('WhatsApp number must be between 1 and 20 characters'),
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Bio cannot exceed 500 characters'),
  body('department')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Department cannot exceed 50 characters')
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

    const { name, position, email, phone, whatsapp, bio, department, skills, languages, socialLinks } = req.body;

    // Check if email already exists
    const existingMember = await TeamMember.findOne({ email });
    if (existingMember) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

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
        message: 'Team member image is required'
      });
    }

    const teamMemberData = {
      name,
      position,
      email,
      phone,
      whatsapp,
      image: imageUrl,
      imagePublicId
    };

    // Add optional fields
    if (bio) teamMemberData.bio = bio;
    if (department) teamMemberData.department = department;
    if (skills) teamMemberData.skills = Array.isArray(skills) ? skills : skills.split(',').map(skill => skill.trim());
    if (languages) teamMemberData.languages = Array.isArray(languages) ? languages : languages.split(',').map(lang => lang.trim());
    if (socialLinks) teamMemberData.socialLinks = socialLinks;

    const teamMember = new TeamMember(teamMemberData);
    await teamMember.save();

    res.status(201).json({
      success: true,
      message: 'Team member created successfully',
      data: teamMember
    });

  } catch (error) {
    console.error('Create team member error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating team member'
    });
  }
});

// @route   PUT /api/team/:id
// @desc    Update team member
// @access  Private (Admin)
router.put('/:id', [
  adminAuth,
  uploadTeam.single('image'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  body('position')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Position must be between 1 and 100 characters'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('phone')
    .optional()
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Phone number must be between 1 and 20 characters'),
  body('whatsapp')
    .optional()
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('WhatsApp number must be between 1 and 20 characters'),
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Bio cannot exceed 500 characters'),
  body('department')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Department cannot exceed 50 characters')
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

    const teamMember = await TeamMember.findById(req.params.id);
    
    if (!teamMember) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    const { name, position, email, phone, whatsapp, bio, department, skills, languages, socialLinks, isActive } = req.body;

    // Check if email already exists (excluding current member)
    if (email && email !== teamMember.email) {
      const existingMember = await TeamMember.findOne({ email, _id: { $ne: req.params.id } });
      if (existingMember) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }
    }

    // Handle image update
    if (req.file) {
      // Delete old image if it exists and was uploaded to Cloudinary
      if (teamMember.imagePublicId) {
        try {
          await deleteImage(teamMember.imagePublicId);
        } catch (error) {
          console.error('Error deleting old image:', error);
        }
      }
      
      teamMember.image = req.file.path;
      teamMember.imagePublicId = req.file.filename;
    } else if (req.body.imageUrl && req.body.imageUrl !== teamMember.image) {
      // Delete old image if switching to URL
      if (teamMember.imagePublicId) {
        try {
          await deleteImage(teamMember.imagePublicId);
        } catch (error) {
          console.error('Error deleting old image:', error);
        }
      }
      
      teamMember.image = req.body.imageUrl;
      teamMember.imagePublicId = undefined;
    }

    // Update fields
    if (name) teamMember.name = name;
    if (position) teamMember.position = position;
    if (email) teamMember.email = email;
    if (phone) teamMember.phone = phone;
    if (whatsapp) teamMember.whatsapp = whatsapp;
    if (bio) teamMember.bio = bio;
    if (department) teamMember.department = department;
    if (isActive !== undefined) teamMember.isActive = isActive === 'true';
    if (skills) teamMember.skills = Array.isArray(skills) ? skills : skills.split(',').map(skill => skill.trim());
    if (languages) teamMember.languages = Array.isArray(languages) ? languages : languages.split(',').map(lang => lang.trim());
    if (socialLinks) teamMember.socialLinks = socialLinks;

    await teamMember.save();

    res.json({
      success: true,
      message: 'Team member updated successfully',
      data: teamMember
    });

  } catch (error) {
    console.error('Update team member error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid team member ID'
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating team member'
    });
  }
});

// @route   DELETE /api/team/:id
// @desc    Delete team member
// @access  Private (Admin)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const teamMember = await TeamMember.findById(req.params.id);
    
    if (!teamMember) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    // Delete image from Cloudinary if it exists
    if (teamMember.imagePublicId) {
      try {
        await deleteImage(teamMember.imagePublicId);
      } catch (error) {
        console.error('Error deleting image:', error);
      }
    }

    await TeamMember.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Team member deleted successfully'
    });

  } catch (error) {
    console.error('Delete team member error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid team member ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while deleting team member'
    });
  }
});

module.exports = router;