const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Category = require('../models/Category');
const Product = require('../models/Product');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/categories
// @desc    Get all categories with product counts
// @access  Public
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
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
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const { search, isActive } = req.query;

    // Build filter object
    let filter = {};
    
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }
    
    if (search) {
      filter.$text = { $search: search };
    }

    // Get categories with pagination
    const categories = await Category.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get product counts for each category
    const productCounts = await Product.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          inStockCount: { $sum: { $cond: [{ $eq: ['$inStock', true] }, 1, 0] } }
        }
      }
    ]);

    // Create a map for easy lookup
    const countsMap = {};
    productCounts.forEach(item => {
      countsMap[item._id.toString()] = {
        total: item.count,
        inStock: item.inStockCount
      };
    });

    // Add counts to categories
    const categoriesWithCounts = categories.map(category => ({
      ...category.toObject(),
      productCount: countsMap[category._id.toString()]?.total || 0,
      inStockCount: countsMap[category._id.toString()]?.inStock || 0
    }));

    // Get total count for pagination
    const total = await Category.countDocuments(filter);

    res.json({
      success: true,
      data: categoriesWithCounts,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit
      }
    });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching categories'
    });
  }
});

// @route   GET /api/categories/:id
// @desc    Get single category with products
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Get products in this category
    const products = await Product.find({ category: category._id })
      .sort({ createdAt: -1 });

    // Get category statistics
    const stats = await Product.aggregate([
      { $match: { category: category._id } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          inStock: { $sum: { $cond: [{ $eq: ['$inStock', true] }, 1, 0] } },
          featured: { $sum: { $cond: [{ $eq: ['$featured', true] }, 1, 0] } },
          avgPrice: { $avg: '$price' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        category,
        products,
        stats: stats[0] || { total: 0, inStock: 0, featured: 0, avgPrice: 0 }
      }
    });

  } catch (error) {
    console.error('Get category error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid category ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching category'
    });
  }
});

// @route   POST /api/categories
// @desc    Create new category
// @access  Private (Admin)
router.post('/', [
  adminAuth,
  body('name')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Category name must be between 1 and 50 characters')
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

    const { name } = req.body;

    // Check if category name already exists
    const existingCategory = await Category.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') } 
    });
    
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Category name already exists'
      });
    }

    const categoryData = {
      name
    };

    const category = new Category(categoryData);
    await category.save();

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: category
    });

  } catch (error) {
    console.error('Create category error:', error);
    
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
        message: 'Category name already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating category'
    });
  }
});

// @route   PUT /api/categories/:id
// @desc    Update category
// @access  Private (Admin)
router.put('/:id', [
  adminAuth,
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Category name must be between 1 and 50 characters')
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

    const category = await Category.findById(req.params.id);
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    const { name, isActive } = req.body;

    // Check if new name already exists (excluding current category)
    if (name && name !== category.name) {
      const existingCategory = await Category.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: req.params.id }
      });
      
      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: 'Category name already exists'
        });
      }
    }

    // Update fields
    if (name) category.name = name;
    if (isActive !== undefined) category.isActive = isActive === 'true';

    await category.save();

    res.json({
      success: true,
      message: 'Category updated successfully',
      data: category
    });

  } catch (error) {
    console.error('Update category error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid category ID'
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
        message: 'Category name already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating category'
    });
  }
});

// @route   DELETE /api/categories/:id
// @desc    Delete category
// @access  Private (Admin)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Check if category has products
    const productCount = await Product.countDocuments({ category: category._id });
    
    if (productCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category. It has ${productCount} products. Please move or delete the products first.`
      });
    }

    await Category.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Category deleted successfully'
    });

  } catch (error) {
    console.error('Delete category error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid category ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while deleting category'
    });
  }
});

// @route   GET /api/categories/stats/overview
// @desc    Get categories overview statistics
// @access  Private (Admin)
router.get('/stats/overview', adminAuth, async (req, res) => {
  try {
    // Get comprehensive statistics
    const stats = await Product.aggregate([
      {
        $group: {
          _id: '$category',
          total: { $sum: 1 },
          inStock: { $sum: { $cond: [{ $eq: ['$inStock', true] }, 1, 0] } },
          outOfStock: { $sum: { $cond: [{ $eq: ['$inStock', false] }, 1, 0] } },
          featured: { $sum: { $cond: [{ $eq: ['$featured', true] }, 1, 0] } },
          avgPrice: { $avg: '$price' },
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' }
        }
      },
      {
        $sort: { total: -1 }
      }
    ]);

    // Get overall statistics
    const overallStats = await Product.aggregate([
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalInStock: { $sum: { $cond: [{ $eq: ['$inStock', true] }, 1, 0] } },
          totalFeatured: { $sum: { $cond: [{ $eq: ['$featured', true] }, 1, 0] } },
          avgPrice: { $avg: '$price' }
        }
      }
    ]);

    // Get recent products by category
    const recentProducts = await Product.aggregate([
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: '$category',
          latestProduct: { $first: '$$ROOT' },
          recentCount: { $sum: 1 }
        }
      }
    ]);

    // Get total categories count
    const totalCategories = await Category.countDocuments({ isActive: true });

    res.json({
      success: true,
      data: {
        categoryStats: stats,
        overallStats: overallStats[0] || { totalProducts: 0, totalInStock: 0, totalFeatured: 0, avgPrice: 0 },
        recentProducts,
        totalCategories
      }
    });

  } catch (error) {
    console.error('Get categories overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching categories overview'
    });
  }
});

module.exports = router;