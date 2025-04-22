const User = require('../models/User');

// Authentication middleware

// Check if user is authenticated
const isAuthenticated = (req, res, next) => {
    console.log('Auth check - isAuthenticated:', req.isAuthenticated());
    console.log('Auth check - user:', req.user);
    
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
};

// Check if user is admin
const isAdmin = (req, res, next) => {
    if (req.isAuthenticated() && req.user.isAdmin) {
        return next();
    }
    res.redirect('/admin/login');
};

// Check if user is premium
const isPremium = (req, res, next) => {
    if (req.isAuthenticated() && req.user.isPremium) {
        return next();
    }
    res.redirect('/upgrade');
};

module.exports = {
    isAuthenticated,
    isAdmin,
    isPremium
}; 