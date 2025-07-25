const mongoose = require('mongoose');
const Category = require('../models/Category');
require('dotenv').config();

const defaultCategories = [
  {
    name: 'Herbs'
  },
  {
    name: 'Seeds'
  },
  {
    name: 'Legumes'
  },
  {
    name: 'Spices'
  }
];

const seedCategories = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/herbs-dashboard', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Check if categories already exist
    const existingCategories = await Category.find();
    
    if (existingCategories.length > 0) {
      console.log('Categories already exist. Skipping seed.');
      process.exit(0);
    }

    // Create default categories
    for (const categoryData of defaultCategories) {
      const existingCategory = await Category.findOne({ 
        name: { $regex: new RegExp(`^${categoryData.name}$`, 'i') } 
      });
      
      if (!existingCategory) {
        const category = new Category(categoryData);
        await category.save();
        console.log(`Created category: ${categoryData.name}`);
      } else {
        console.log(`Category already exists: ${categoryData.name}`);
      }
    }

    console.log('Categories seeded successfully!');

  } catch (error) {
    console.error('Error seeding categories:', error);
  } finally {
    mongoose.connection.close();
  }
};

// Run the seeding
seedCategories();