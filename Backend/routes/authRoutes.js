const express = require('express');
const router = express.Router();
const passport = require('passport');
const User=require('../models/User');


router.post('/register',async(req,res)=>{
    try{
        const isAdmin = req.body.isAdmin === true;
        
        // Check if email already exists
        const existingUser = await User.findOne({ email: req.body.email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'An account with this email address already exists'
            });
        }
        
        const user = await User.register(new User({email: req.body.email, isAdmin}), req.body.password);
        
        passport.authenticate('local')(req,res,()=>{
            res.json({success: true, user});
        });
    } catch(error){
        console.error('Registration error:', error);
        
        let errorMessage = error.message || 'Registration failed. Please try again.';
        
        // Handle specific error cases with user-friendly messages
        if (error.name === 'UserExistsError') {
            errorMessage = 'An account with this email address already exists.';
        } else if (error.message.includes('password')) {
            errorMessage = 'Please provide a valid password.';
        } else if (error.message.includes('email')) {
            errorMessage = 'Please provide a valid email address.';
        }
        
        res.status(400).json({success: false, error: errorMessage});
    }
})

router.post('/login',(req,res,next)=>{
    passport.authenticate('local',(err,user,info)=>{
        if(err){
            return next(err);
        }
        if(!user){
            return res.status(401).json({success:false,message:'Invalid email or password'});
        }
        req.logIn(user,(err)=>{
            if(err){
                return next(err);
            }
            res.json({success:true,user});
        })
    })
    (req,res,next)
})

router.get('/check',(req,res)=>{
    if(req.isAuthenticated()){
        res.json({success:true,user:req.user});
    }else{
        res.json({success:false});
    }
})

router.get('/logout',(req,res)=>{
    req.logout((err)=>{
        if(err){
            return next(err);
        }
        res.json({success:true});
    })
})

router.get('/admin/register',(req,res)=>{
    res.render('adminRegister')
})

router.post('/admin/register',async(req,res)=>{
    try{
        const secretCode=req.body.secretCode;
        if(secretCode!=='abcd1234'){
            return res.render('adminRegister',{error:'Invalid secret code'});
        }
        
        // Check if email already exists
        const existingUser = await User.findOne({ email: req.body.email });
        if (existingUser) {
            return res.render('adminRegister', {
                error: 'An account with this email address already exists'
            });
        }
        
        const isAdmin=true;
        const user=await User.register(new User({email:req.body.email, isAdmin}),req.body.password);
        passport.authenticate('local')(req,res,()=>{
            res.redirect('/admin/login');
        })
    }catch(error){
        console.error('Registration error:', error);
        
        // Handle specific error cases with user-friendly messages
        let errorMessage = 'Registration failed. Please try again.';
        
        if (error.name === 'UserExistsError') {
            errorMessage = 'An account with this email address already exists.';
        } else if (error.message.includes('password')) {
            errorMessage = 'Please provide a valid password.';
        } else if (error.message.includes('email')) {
            errorMessage = 'Please provide a valid email address.';
        }
        
        res.render('adminRegister', { error: errorMessage });
    }
})

router.get('/admin/login',(req,res)=>{
    res.render('adminLogin');
})

router.post('/admin/login',(req,res,next)=>{
    passport.authenticate('local',(err,user,info)=>{
        if(err){
            console.error('Authentication error:', err);
            return res.render('adminLogin',{error:'Authentication error. Please try again.'});
        }
        
        if(!user){
            // Provide a more specific message when login fails
            return res.render('adminLogin',{error:'Invalid email or password. Please try again.'});
        }
        
        if(!user.isAdmin){
            return res.render('adminLogin',{error:'You are not authorized as an admin.'});
        }

        req.login(user,(err)=>{
            if(err){
                console.error('Login error:', err);
                return res.render('adminLogin',{error:'Login failed. Please try again.'});
            }
            return res.redirect('/admin/dashboard');
        })
    })(req,res,next);
})

router.get('/admin/check', (req, res) => {
    if (req.isAuthenticated() && req.user.isAdmin) {
        res.json({ success: true, user: req.user });
    } else {
        res.json({ success: false });
    }
});

router.get('/admin/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return next(err);
        }
        res.redirect('/admin/login');
    });
});

// Regular user signup page route
router.get('/signup', (req, res) => {
    res.render('signup');
});

// Regular user login page route
router.get('/login', (req, res) => {
    res.render('login');
});

// Regular user login post route
router.post('/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            console.error('Authentication error:', err);
            return res.render('login', {error: 'Authentication error. Please try again.'});
        }
        
        if (!user) {
            return res.render('login', {error: 'Invalid email or password. Please try again.'});
        }

        req.login(user, (err) => {
            if (err) {
                console.error('Login error:', err);
                return res.render('login', {error: 'Login failed. Please try again.'});
            }
            
            console.log('User logged in successfully:', user.email);
            
            // If user is admin, redirect to admin dashboard
            if (user.isAdmin) {
                return res.redirect('/admin/dashboard');
            }
            
            // Otherwise redirect to regular user dashboard
            return res.redirect('/dashboard');
        });
    })(req, res, next);
});

// Regular user register post route
router.post('/register', async (req, res) => {
    try {
        // Check if email already exists
        const existingUser = await User.findOne({ email: req.body.email });
        if (existingUser) {
            return res.render('signup', {
                error: 'An account with this email address already exists'
            });
        }
        
        // Set premium status if selected
        const isPremium = req.body.isPremium === 'on';
        const isAdmin = false;
        
        const user = await User.register(
            new User({
                email: req.body.email,
                isAdmin,
                isPremium
            }),
            req.body.password
        );
        
        passport.authenticate('local')(req, res, () => {
            res.redirect('/dashboard');
        });
    } catch (error) {
        console.error('Registration error:', error);
        
        // Handle specific error cases with user-friendly messages
        let errorMessage = 'Registration failed. Please try again.';
        
        if (error.name === 'UserExistsError') {
            errorMessage = 'An account with this email address already exists.';
        } else if (error.message.includes('password')) {
            errorMessage = 'Please provide a valid password.';
        } else if (error.message.includes('email')) {
            errorMessage = 'Please provide a valid email address.';
        }
        
        res.render('signup', { error: errorMessage });
    }
});

// Logout route
router.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) {
            return next(err);
        }
        res.redirect('/');
    });
});

// API-based login route - for any clients that need JSON responses
router.post('/api/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            return res.status(500).json({
                success: false,
                error: 'Authentication error: ' + err.message
            });
        }
        
        if (!user) {
            return res.status(401).json({
                success: false,
                error: info ? info.message : 'Invalid email or password'
            });
        }
        
        req.login(user, (err) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: 'Login failed: ' + err.message
                });
            }
            
            // Redirect URL based on user type
            let redirectUrl = '/dashboard';
            if (user.isAdmin) {
                redirectUrl = '/admin/dashboard';
            }
            
            return res.json({
                success: true,
                user: {
                    id: user._id,
                    email: user.email,
                    isAdmin: user.isAdmin,
                    isPremium: user.isPremium
                },
                redirectUrl
            });
        });
    })(req, res, next);
});

// API-based register route - for any clients that need JSON responses
router.post('/api/register', async (req, res) => {
    try {
        // Check if email already exists
        const existingUser = await User.findOne({ email: req.body.email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'An account with this email address already exists'
            });
        }
        
        const isAdmin = req.body.isAdmin === true;
        const isPremium = req.body.isPremium === true;
        
        const user = await User.register(
            new User({
                email: req.body.email,
                isAdmin,
                isPremium
            }),
            req.body.password
        );
        
        passport.authenticate('local')(req, res, () => {
            res.json({
                success: true,
                user: {
                    id: user._id,
                    email: user.email,
                    isAdmin: user.isAdmin,
                    isPremium: user.isPremium
                }
            });
        });
    } catch (error) {
        console.error('Registration error:', error);
        
        let errorMessage = error.message || 'Registration failed. Please try again.';
        
        if (error.name === 'UserExistsError') {
            errorMessage = 'An account with this email address already exists.';
        } else if (error.message.includes('password')) {
            errorMessage = 'Please provide a valid password.';
        } else if (error.message.includes('email')) {
            errorMessage = 'Please provide a valid email address.';
        }
        
        res.status(400).json({
            success: false,
            error: errorMessage
        });
    }
});

// Debug route to check session and redirect
router.get('/debug-session', (req, res) => {
    console.log('Session data:', req.session);
    console.log('User authenticated:', req.isAuthenticated());
    console.log('User object:', req.user);
    
    res.json({
        isAuthenticated: req.isAuthenticated(),
        user: req.user,
        session: req.session
    });
});

// Direct login route (temporary workaround)
router.get('/direct-login/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).send('User not found');
        }
        
        req.login(user, (err) => {
            if (err) {
                console.error('Login error:', err);
                return res.status(500).send('Login failed');
            }
            
            console.log('User manually logged in:', user.email);
            
            if (user.isAdmin) {
                return res.redirect('/admin/dashboard');
            }
            
            return res.redirect('/dashboard');
        });
    } catch (error) {
        console.error('Error in direct login:', error);
        res.status(500).send('Error in direct login');
    }
});

// Debug API - Get user by email
router.get('/api/get-user-by-email', async (req, res) => {
    try {
        if (!req.query.email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        const user = await User.findOne({ email: req.query.email });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ 
            success: true, 
            user: {
                _id: user._id,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Error fetching user by email:', error);
        res.status(500).json({ error: 'Error fetching user' });
    }
});

module.exports = router;



