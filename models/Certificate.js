const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Certificate name is required'],
    trim: true,
    maxlength: [100, 'Certificate name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Certificate description is required'],
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  image: {
    type: String,
    required: [true, 'Certificate image is required']
  },
  imagePublicId: {
    type: String // Cloudinary public ID for image management
  },
  issuer: {
    type: String,
    trim: true,
    maxlength: [100, 'Issuer name cannot exceed 100 characters']
  },
  issueDate: {
    type: Date
  },
  expiryDate: {
    type: Date
  },
  certificateNumber: {
    type: String,
    trim: true,
    maxlength: [50, 'Certificate number cannot exceed 50 characters']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  category: {
    type: String,
    enum: ['quality', 'organic', 'safety', 'environmental', 'other'],
    default: 'other'
  },
  documentUrl: {
    type: String // URL to the actual certificate document
  }
}, {
  timestamps: true
});

// Index for search functionality
certificateSchema.index({ name: 'text', description: 'text', issuer: 'text' });
certificateSchema.index({ category: 1 });
certificateSchema.index({ isActive: 1 });
certificateSchema.index({ expiryDate: 1 });

module.exports = mongoose.model('Certificate', certificateSchema);