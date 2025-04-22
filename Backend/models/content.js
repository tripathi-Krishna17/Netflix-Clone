const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema({
    tmdbId: {
        type: Number,
        required: true,
        unique: true
    },
    title: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['movie', 'tvshow'],
        required: true
    },
    overview: {
        type: String,
        required: true
    },
    posterPath: String,
    backdropPath: String,
    videoUrl: String,
    releaseDate: Date,
    ratings: {
        type: Number,
        default: 0
    },
    genres: [{
        type: String
    }],
    cast: [{
        id: Number,
        name: String,
        character: String,
        profilePath: String
    }],
    productionCompanies: [{
        id: Number,
        name: String,
        logoPath: String
    }],
    // Movie specific fields
    runtime: Number,
    // TV Show specific fields
    numberOfSeasons: Number,
    numberOfEpisodes: Number,
    // Common fields
    status: {
        type: String,
        default: 'active'
    },
    featured: {
        type: Boolean,
        default: false
    },
    trending: {
        type: Boolean,
        default: false
    },
    isFree: {
        type: Boolean,
        default: false
    },
    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

// Index for faster searches
contentSchema.index({ title: 'text', overview: 'text' });
contentSchema.index({ type: 1, status: 1 });
contentSchema.index({ tmdbId: 1 }, { unique: true });
contentSchema.index({ isFree: 1 });

const Content = mongoose.model('Content', contentSchema);

module.exports = Content; 