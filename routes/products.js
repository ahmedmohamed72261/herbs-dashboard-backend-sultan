const express = require('express');
const Product = require('../models/Product');
const Category = require('../models/Category');
const { adminAuth } = require('../middleware/auth');
const { uploadProduct, deleteImage } = require('../config/cloudinary');
const mongoose = require('mongoose');

const router = express.Router();

// @route   GET /api/products
// @desc    Get all products with filtering and pagination
// @access  Public
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { category, search, featured, inStock } = req.query;

    // Build filter object
    let filter = {};
    
    if (category && mongoose.Types.ObjectId.isValid(category)) {
      filter.category = category;
    }
    
    if (featured !== undefined) {
      filter.featured = featured === 'true';
    }
    
    if (inStock !== undefined) {
      filter.inStock = inStock === 'true';
    }
    
    if (search) {
      filter.$text = { $search: search };
    }

    // Get products with pagination and populate category
    const products = await Product.find(filter)
      .populate('category', 'name slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const total = await Product.countDocuments(filter);

    res.json({
      success: true,
      data: products,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit
      }
    });

  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching products'
    });
  }
});

// @route   GET /api/products/:id
// @desc    Get single product
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category', 'name slug');
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: product
    });

  } catch (error) {
    console.error('Get product error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching product'
    });
  }
});

// @route   POST /api/products
// @desc    Create new product
// @access  Private (Admin)
router.post('/', adminAuth, uploadProduct.single('image'), async (req, res) => {
  try {
    console.log('POST /products - Request body:', req.body);
    console.log('POST /products - Request file:', req.file);
    
    const { name, description, category, price, tags, origin, certifications } = req.body;
    
    // Basic validation
    if (!name || !description || !category) {
      return res.status(400).json({
        success: false,
        message: 'Name, description, and category are required'
      });
    }
    
    // Check if category is a valid ObjectId format
    if (!mongoose.Types.ObjectId.isValid(category)) {
      console.log('Invalid ObjectId format:', category);
      return res.status(400).json({
        success: false,
        message: 'Invalid category ID format'
      });
    }

    // Validate category exists
    try {
      console.log('Looking for category with ID:', category);
      const categoryExists = await Category.findById(category);
      console.log('Category search result:', categoryExists);
      
      if (!categoryExists) {
        console.log('Category not found in database');
        return res.status(400).json({
          success: false,
          message: 'Category not found in database'
        });
      }
      console.log('Category validation passed');
    } catch (error) {
      console.log('Category validation error:', error.message);
      return res.status(400).json({
        success: false,
        message: 'Invalid category ID format: ' + error.message
      });
    }

    // Check if image was uploaded
    let imageUrl, imagePublicId;
    
    console.log('File upload check - req.file:', req.file);
    
    if (req.file) {
      imageUrl = req.file.path;
      imagePublicId = req.file.filename;
      console.log('Using uploaded file:', imageUrl);
    } else {
      console.log('No image provided - using placeholder');
      imageUrl = 'https://via.placeholder.com/300x300?text=No+Image';
      imagePublicId = null;
    }

    const productData = {
      name,
      description,
      category,
      image: imageUrl,
      imagePublicId
    };

    // Add optional fields
    if (price) productData.price = price;
    if (tags) productData.tags = Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim());
    if (origin) productData.origin = origin;
    if (certifications) productData.certifications = Array.isArray(certifications) ? certifications : certifications.split(',').map(cert => cert.trim());

    console.log('Creating product with data:', productData);
    
    const product = new Product(productData);
    await product.save();

    // Populate the category before sending response
    await product.populate('category', 'name slug');

    console.log('Product created successfully:', product);

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });

  } catch (error) {
    console.error('Create product error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating product: ' + error.message
    });
  }
});

// @route   PUT /api/products/:id
// @desc    Update product
// @access  Private (Admin)
router.put('/:id', adminAuth, uploadProduct.single('image'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const { name, description, category, price, tags, origin, certifications, featured, inStock } = req.body;

    // Validate category exists if provided
    if (category) {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category ID format'
        });
      }
      
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return res.status(400).json({
          success: false,
          message: 'Category not found'
        });
      }
    }

    // Handle image update
    if (req.file) {
      // Delete old image if it exists and was uploaded to Cloudinary
      if (product.imagePublicId) {
        try {
          await deleteImage(product.imagePublicId);
        } catch (error) {
          console.error('Error deleting old image:', error);
        }
      }
      
      product.image = req.file.path;
      product.imagePublicId = req.file.filename;
    }

    // Update fields
    if (name) product.name = name;
    if (description) product.description = description;
    if (category) product.category = category;
    if (price !== undefined) product.price = price;
    if (featured !== undefined) product.featured = featured === 'true';
    if (inStock !== undefined) product.inStock = inStock === 'true';
    if (tags) product.tags = Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim());
    if (origin) product.origin = origin;
    if (certifications) product.certifications = Array.isArray(certifications) ? certifications : certifications.split(',').map(cert => cert.trim());

    await product.save();

    // Populate category
    await product.populate('category', 'name slug');

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: product
    });

  } catch (error) {
    console.error('Update product error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
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
      message: 'Server error while updating product'
    });
  }
});

// @route   DELETE /api/products/:id
// @desc    Delete product
// @access  Private (Admin)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Delete image from Cloudinary if it exists
    if (product.imagePublicId) {
      try {
        await deleteImage(product.imagePublicId);
      } catch (error) {
        console.error('Error deleting image:', error);
      }
    }

    await Product.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });

  } catch (error) {
    console.error('Delete product error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while deleting product'
    });
  }
});

module.exports = router;