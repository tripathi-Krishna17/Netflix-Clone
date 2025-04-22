const mongoose = require('mongoose');

const tvshowSchema = new mongoose.Schema({
    showId: {
        type: Number,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    overview: {
        type: String,
        required: true
    },
    genres: {
        type: [String],
        required: true
    },
    genreIds: {
        type: [Number],
        required: true
    },
    firstAirDate: {
        type: Date,
        required: true
    },
    ratings: {
        type: Number,
        required: true
    },
    posterPath: {
        type: String,
        required: true
    },
    backdropPath: {
        type: String,
        required: true
    },
    popularity: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        required: true
    },
    numberOfSeasons: {
        type: Number,
        required: true
    },
    numberOfEpisodes: {
        type: Number,
        required: true
    },
    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('TVShow', tvshowSchema); 