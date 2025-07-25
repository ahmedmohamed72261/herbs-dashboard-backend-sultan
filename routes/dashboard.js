const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const Product = require('../models/Product');
const Certificate = require('../models/Certificate');
const Team = require('../models/TeamMember');
const Message = require('../models/Message');
// const Contact = require('../models/Contact'); // Not needed if using Message model

// Get dashboard overview data
router.get('/overview', async (req, res) => {
  try {
    // Get counts for all entities
    const [
      categoriesCount,
      productsCount,
      certificatesCount,
      teamCount,
      messagesCount,
      unreadMessagesCount,
      contactMethodsCount
    ] = await Promise.all([
      Category.countDocuments(),
      Product.countDocuments(),
      Certificate.countDocuments(),
      Team.countDocuments(),
      Message.countDocuments(),
      Message.countDocuments({ read: false }),
      Message.countDocuments() // Using Message model for contact methods count
    ]);

    // Get recent activities (last 10 activities)
    const recentActivities = [];
    
    // Get recent categories
    const recentCategories = await Category.find()
      .sort({ createdAt: -1 })
      .limit(3)
      .select('name createdAt');
    
    recentCategories.forEach(category => {
      recentActivities.push({
        id: `category_${category._id}`,
        type: 'category',
        message: `New category "${category.name}" was added`,
        time: getTimeAgo(category.createdAt),
        timestamp: category.createdAt
      });
    });

    // Get recent products
    const recentProducts = await Product.find()
      .sort({ createdAt: -1 })
      .limit(3)
      .select('name createdAt');
    
    recentProducts.forEach(product => {
      recentActivities.push({
        id: `product_${product._id}`,
        type: 'product',
        message: `New product "${product.name}" was added`,
        time: getTimeAgo(product.createdAt),
        timestamp: product.createdAt
      });
    });

    // Get recent certificates
    const recentCertificates = await Certificate.find()
      .sort({ createdAt: -1 })
      .limit(2)
      .select('name createdAt');
    
    recentCertificates.forEach(certificate => {
      recentActivities.push({
        id: `certificate_${certificate._id}`,
        type: 'certificate',
        message: `Certificate "${certificate.name}" was updated`,
        time: getTimeAgo(certificate.createdAt),
        timestamp: certificate.createdAt
      });
    });

    // Get recent team members
    const recentTeamMembers = await Team.find()
      .sort({ createdAt: -1 })
      .limit(2)
      .select('name createdAt');
    
    recentTeamMembers.forEach(member => {
      recentActivities.push({
        id: `team_${member._id}`,
        type: 'team',
        message: `New team member "${member.name}" was added`,
        time: getTimeAgo(member.createdAt),
        timestamp: member.createdAt
      });
    });

    // Get recent messages
    const recentMessages = await Message.find()
      .sort({ createdAt: -1 })
      .limit(2)
      .select('name createdAt');
    
    recentMessages.forEach(message => {
      recentActivities.push({
        id: `message_${message._id}`,
        type: 'message',
        message: `New contact message from "${message.name}"`,
        time: getTimeAgo(message.createdAt),
        timestamp: message.createdAt
      });
    });

    // Sort activities by timestamp and limit to 8 most recent
    const sortedActivities = recentActivities
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 8)
      .map(activity => ({
        id: activity.id,
        type: activity.type,
        message: activity.message,
        time: activity.time
      }));

    // Calculate growth percentages (mock data for now)
    const stats = {
      categories: {
        count: categoriesCount,
        change: '+2',
        changeType: 'increase'
      },
      products: {
        count: productsCount,
        change: '+5',
        changeType: 'increase'
      },
      certificates: {
        count: certificatesCount,
        change: '+1',
        changeType: 'increase'
      },
      team: {
        count: teamCount,
        change: '+1',
        changeType: 'increase'
      },
      messages: {
        count: messagesCount,
        change: '+3',
        changeType: 'increase'
      },
      unreadMessages: {
        count: unreadMessagesCount,
        change: '+2',
        changeType: 'increase'
      },
      contactMethods: {
        count: contactMethodsCount,
        change: '0',
        changeType: 'neutral'
      }
    };

    // System status (mock data)
    const systemStatus = {
      database: {
        status: 'online',
        message: 'All systems operational',
        color: 'green'
      },
      api: {
        status: 'healthy',
        message: 'Response time: 120ms',
        color: 'green'
      },
      backup: {
        status: 'scheduled',
        message: `Last backup: ${getTimeAgo(new Date(Date.now() - 2 * 60 * 60 * 1000))}`,
        color: 'yellow'
      },
      performance: {
        status: 'excellent',
        message: 'System running optimally',
        color: 'blue'
      }
    };

    res.json({
      success: true,
      data: {
        stats,
        recentActivities: sortedActivities,
        systemStatus
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard overview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard overview',
      error: error.message
    });
  }
});

// Helper function to calculate time ago
function getTimeAgo(date) {
  const now = new Date();
  const diffInMs = now - new Date(date);
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMinutes < 60) {
    return `${diffInMinutes} minutes ago`;
  } else if (diffInHours < 24) {
    return `${diffInHours} hours ago`;
  } else {
    return `${diffInDays} days ago`;
  }
}

module.exports = router;