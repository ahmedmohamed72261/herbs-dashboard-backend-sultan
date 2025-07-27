const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  type: {
    type: String,
    required: [true, 'Contact type is required'],
    trim: true,
    maxlength: [50, 'Contact type cannot exceed 50 characters'],
    validate: {
      validator: function(value) {
        // Exclude website and social media types
        const excludedTypes = ['website', 'social', 'facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'tiktok'];
        return !excludedTypes.includes(value.toLowerCase());
      },
      message: 'Website and social media contact types are not allowed'
    }
  },
  label: {
    type: String,
    required: [true, 'Contact label is required'],
    trim: true,
    maxlength: [100, 'Contact label cannot exceed 100 characters']
  },
  value: {
    type: String,
    required: [true, 'Contact value is required'],
    trim: true,
    maxlength: [500, 'Contact value cannot exceed 500 characters']
  },
    icon: {
    type: String,
    trim: true,
    maxlength: [50, 'Icon name cannot exceed 50 characters']
  }
}, {
  timestamps: true
});

// Index for search functionality
contactSchema.index({ type: 'text', label: 'text', value: 'text' });
contactSchema.index({ type: 1 });
contactSchema.index({ createdAt: -1 });

// Static method to get allowed contact types
contactSchema.statics.getAllowedTypes = function() {
  return ['phone', 'email', 'address', 'whatsapp', 'telegram', 'skype', 'fax', 'other'];
};

// Static method to get excluded types
contactSchema.statics.getExcludedTypes = function() {
  return ['website', 'social', 'facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'tiktok'];
};

// Instance method to check if contact type is allowed
contactSchema.methods.isTypeAllowed = function() {
  const excludedTypes = this.constructor.getExcludedTypes();
  return !excludedTypes.includes(this.type.toLowerCase());
};


module.exports = mongoose.model('Contact', contactSchema);