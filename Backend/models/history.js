const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Schema for a watch history item
const watchedItemSchema = new Schema({
    content: {
        type: Schema.Types.ObjectId,
        ref: 'Content',
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    progress: {
        type: Number,
        default: 0
    },
    season: {
        type: Number,
        default: 1
    },
    episode: {
        type: Number,
        default: 1
    }
});

// Main history schema
const historySchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    watched: [watchedItemSchema]
}, { timestamps: true });

module.exports = mongoose.model('History', historySchema); 