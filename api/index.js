const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import routes
const authRoutes = require('../routes/auth');
const productRoutes = require('../routes/products');
const certificateRoutes = require('../routes/certificates');
const teamRoutes = require('../routes/team');
const categoryRoutes = require('../routes/categories');
const contactRoutes = require('../routes/contact');
const messageRoutes = require('../routes/messages');
const dashboardRoutes = require('../routes/dashboard');

const app = express();

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// CORS configuration
app.use(cors({
  origin: '*',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware (simplified for serverless)
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('combined'));
}

// Database connection with connection reuse for serverless
let cachedConnection = null;

async function connectToDatabase() {
  if (cachedConnection) {
    return cachedConnection;
  }

  try {
    const connection = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/herbs-dashboard', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      bufferCommands: false,
      bufferMaxEntries: 0,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    cachedConnection = connection;
    console.log('Connected to MongoDB');
    return connection;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

// Middleware to ensure database connection before handling requests
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    console.error('Database connection failed:', error);
    res.status(500).json({
      success: false,
      message: 'Database connection failed'
    });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Herbs Dashboard API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Herbs Dashboard API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      products: '/api/products',
      certificates: '/api/certificates',
      team: '/api/team',
      categories: '/api/categories',
      contact: '/api/contact',
      messages: '/api/messages',
      dashboard: '/api/dashboard'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Error:', error);
  
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// Export the Express app as a serverless function
module.exports = app;