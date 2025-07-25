const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const initializeAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/herbs-dashboard', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@herbs.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminEmail });
    
    if (existingAdmin) {
      console.log('Admin user already exists');
      console.log(`Email: ${adminEmail}`);
      process.exit(0);
    }

    // Create admin user
    const admin = new User({
      email: adminEmail,
      password: adminPassword,
      role: 'admin'
    });

    await admin.save();

    console.log('Admin user created successfully!');
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${adminPassword}`);
    console.log('\nPlease change the default password after first login.');

  } catch (error) {
    console.error('Error initializing admin:', error);
  } finally {
    mongoose.connection.close();
  }
};

// Run the initialization
initializeAdmin();