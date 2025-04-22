const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const passportLocalMongoose = require('passport-local-mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        trim: true,
        index: false
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    isPremium: {
        type: Boolean,
        default: false
    },
    watchlist: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Content'
    }],
    watchHistory: [{
        content: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Content'
        },
        lastWatched: {
            type: Date,
            default: Date.now
        },
        progress: {
            type: Number,
            default: 0
        }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    // Skip hashing if password is not modified or doesn't exist
    if (!this.isModified('password') || !this.password) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// Configure passport-local-mongoose with options
userSchema.plugin(passportLocalMongoose, { 
    usernameField: 'email',
    usernameLowerCase: true,
    selectFields: 'email isAdmin isPremium watchlist watchHistory createdAt'
});

const user = mongoose.model('User', userSchema);

module.exports = user;