require('dotenv').config()
const express=require("express");
const app=express();
const cors=require("cors");
const bodyparser=require("body-parser");
const hbs = require('hbs');
const mongoose = require("mongoose");
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const path = require('path');
const { isAuthenticated } = require('./middleware/auth');
const fs = require('fs');
const exphbs = require('express-handlebars');

// Register Handlebars helpers
hbs.registerHelper('formatDate', function(date) {
    return new Date(date).toLocaleDateString();
});

hbs.registerHelper('eq', function (a, b) { return a === b; });
hbs.registerHelper('gt', function (a, b) { return a > b; });
hbs.registerHelper('lt', function (a, b) { return a < b; });
hbs.registerHelper('add', function (a, b) { return a + b; });
hbs.registerHelper('subtract', function (a, b) { return a - b; });
hbs.registerHelper('times', function (n, block) {
    let accum = '';
    for (let i = 1; i <= n; ++i) {
        accum += block.fn(i);
    }
    return accum;
});
hbs.registerHelper('inWatchlist', function (movieId, watchlist) {
    return watchlist.some(id => id.toString() === movieId.toString());
});

hbs.registerHelper('isYouTubeUrl', function (url) {
    return url && (url.includes('youtube.com') || url.includes('youtu.be'));
});

hbs.registerHelper('isRemoteUrl', function (url) {
    return url && url.includes('/remote-videos/');
});

// Ensure temp-uploads directory exists
const tempUploadsDir = path.join(__dirname, 'temp-uploads');
if (!fs.existsSync(tempUploadsDir)) {
    fs.mkdirSync(tempUploadsDir, { recursive: true });
}

// Ensure public/videos directory exists
const publicVideosDir = path.join(__dirname, 'public', 'videos');
if (!fs.existsSync(publicVideosDir)) {
    fs.mkdirSync(publicVideosDir, { recursive: true });
}

app.set('view engine','hbs');
app.set('views', './views');

const port = process.env.PORT || 5000;

// MongoDB Connection
const MONGODB_URI = 'mongodb+srv://Krishna17:Pratibha1970@netflix.uje7uc2.mongodb.net/?retryWrites=true&w=majority&appName=Netflix';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4
}).then(() => {
    console.log('Connected to MongoDB');
    // Setup the SFTP directories
    try {
        require('./setup-sftp');
    } catch (error) {
        console.error('Error setting up SFTP:', error);
    }
}).catch(error => {
    console.error('MongoDB connection error:', error);
    mongoose.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        socketTimeoutMS: 45000,
        family: 4
    });
});

const db = mongoose.connection;

db.on('error', (error) => {
    console.error('MongoDB Connection Error:', error);
});

db.on('connected', async () => {
    console.log('Connected to MongoDB Atlas');
    
    try {
        // Check if the username index exists and drop it
        const User = require('./models/User');
        const indexes = await User.collection.indexes();
        const usernameIndex = indexes.find(idx => idx.name === 'username_1');
        
        if (usernameIndex) {
            console.log('Dropping username_1 index to prevent duplicate key errors');
            await User.collection.dropIndex('username_1');
            console.log('Successfully dropped username_1 index');
        }
    } catch (error) {
        console.error('Error handling username index:', error);
    }
});

db.on('disconnected', () => {
    console.log('MongoDB disconnected. Attempting to reconnect...');
    mongoose.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        family: 4
    });
});

// Session Configuration
app.use(session({
    secret: process.env.JWT_SECRET || 'abcd1234',
    resave: false,
    saveUninitialized: false,
    store: new MongoStore({ 
        mongoUrl: MONGODB_URI,
        ttl: 24 * 60 * 60 // 1 day
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
    }
}));

// Passport Configuration
const User = require('./models/User');
passport.use(new LocalStrategy({ 
    usernameField: 'email',
    passwordField: 'password'
}, User.authenticate()));

app.use(passport.initialize());
app.use(passport.session());

// Use passport-local-mongoose's built-in serialization
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/videos', express.static('public/videos'));
app.use(bodyparser.json());
app.use(bodyparser.urlencoded({ extended: true }));

// CORS headers specifically for video streaming
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
  if (req.url.includes('/remote-videos/')) {
    console.log(`[DEBUG] Setting CORS headers for video request: ${req.url}`);
  }
  next();
});

// Error handler for videos not found
app.use('/videos/*', (req, res, next) => {
  const requestedPath = req.path;
  console.log(`[DEBUG] Video not found in public/videos: ${requestedPath}`);
  res.status(404).json({
    error: 'Not Found',
    details: 'The requested video file was not found in the public directory',
    path: requestedPath
  });
});

// Global user middleware
app.use((req, res, next) => {
    res.locals.currentUser = req.user || null;
    res.locals.isAuthenticated = req.isAuthenticated() || false;
    next();
});

// Global variables to be accessible across modules if needed
global.uploadProgress = {};

// Routes
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');
const movieRoutes = require('./routes/movies');
const tvshowRoutes = require('./routes/tvshows');
const remoteVideosRoutes = require('./routes/remoteVideos');

app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/admin', adminRoutes);
app.use('/movies', movieRoutes);
app.use('/tvshows', tvshowRoutes);
app.use('/remote-videos', remoteVideosRoutes);

// Home route
app.get('/', (req, res) => {
    // If user is already logged in
    if (req.isAuthenticated()) {
        // If admin, redirect to admin dashboard
        if (req.user.isAdmin) {
            return res.redirect('/admin/dashboard');
        }
        // Otherwise redirect to user dashboard
        return res.redirect('/dashboard');
    }
    // If not logged in, show the home page with user selection
    res.render('home');
});

app.listen(port,()=>{
    console.log(`API is running on port ${port}`)
})

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    
    // If headers are already sent, don't send another response
    if (res.headersSent) {
        return next(err);
    }

    // Check if the request expects JSON
    if (req.accepts('json')) {
        res.status(500).json({
            error: 'Internal Server Error',
            details: err.message
        });
    } else {
        // If not JSON, render error page
        res.status(500).render('error', {
            message: 'Internal Server Error',
            error: process.env.NODE_ENV === 'development' ? err : {}
        });
    }
});

// Handle 404 errors
app.use((req, res) => {
    if (req.accepts('json')) {
        res.status(404).json({
            error: 'Not Found',
            details: 'The requested resource was not found'
        });
    } else {
        res.status(404).render('error', {
            message: 'Not Found',
            error: {}
        });
    }
});