const express = require('express');
const router = express.Router();
const Content = require('../models/content');
const User = require('../models/User');
const { isAuthenticated } = require('../middleware/auth');
const axios = require('axios');

// Get trending TV shows from TMDB - placing specific routes before dynamic ID routes
router.get('/trending', isAuthenticated, async (req, res) => {
    try {
        // Use the environment variable or fall back to hardcoded API key
        const TMDB_API_KEY = process.env.TMDB_API_KEY || '6ec9180bfc843aba1677d9ff1b531116';
        
        console.log('Using TMDB API key for trending TV shows:', TMDB_API_KEY.substring(0, 5) + '...');

        const response = await axios.get(`https://api.themoviedb.org/3/trending/tv/week`, {
            params: {
                api_key: TMDB_API_KEY,
                language: 'en-US'
            },
            timeout: 10000 // Adding timeout to avoid hanging requests
        });

        if (!response.data || !response.data.results) {
            console.error('Invalid response from TMDB API:', response.data);
            return res.status(500).json({ error: 'Invalid response from TMDB API' });
        }

        console.log(`Successfully fetched ${response.data.results.length} trending TV shows from TMDB`);

        // Transform TMDB results to our app format with null checks
        const trendingTVShows = response.data.results.slice(0, 10).map(show => ({
            id: show.id,
            title: show.name || 'Unknown Title',
            overview: show.overview || 'No overview available',
            posterPath: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : null,
            backdropPath: show.backdrop_path ? `https://image.tmdb.org/t/p/original${show.backdrop_path}` : null,
            releaseDate: show.first_air_date || 'Unknown',
            ratings: show.vote_average || 0
        }));
        
        res.json(trendingTVShows);
    } catch (error) {
        console.error('Error fetching trending TV shows:', {
            message: error.message,
            code: error.code,
            status: error.response?.status
        });
        res.status(500).json({ 
            error: 'Error fetching trending TV shows', 
            message: error.message
        });
    }
});

// Get TV show trailers directly from TMDB by TMDB ID
router.get('/tmdb/:tmdbId/videos', isAuthenticated, async (req, res) => {
    try {
        // Use the environment variable or fall back to hardcoded API key
        const TMDB_API_KEY = process.env.TMDB_API_KEY || '6ec9180bfc843aba1677d9ff1b531116';
        const tmdbId = req.params.tmdbId;
        
        console.log(`Fetching videos directly from TMDB for TV show ID: ${tmdbId}`);
        
        const response = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}/videos`, {
            params: {
                api_key: TMDB_API_KEY,
                language: 'en-US'
            },
            timeout: 10000 // Adding timeout to avoid hanging requests
        });

        if (!response.data || !response.data.results) {
            console.error('Invalid response from TMDB API for videos');
            return res.status(500).json({ error: 'Invalid response from TMDB API' });
        }

        const videos = response.data.results.map(video => ({
            id: video.id,
            key: video.key,
            name: video.name || '',
            site: video.site || '',
            type: video.type || ''
        }));
        
        console.log(`Found ${videos.length} videos for TMDB TV show ID: ${tmdbId}`);
        res.json(videos);
    } catch (error) {
        console.error('Error fetching videos directly from TMDB:', error.message);
        res.status(500).json({ 
            error: 'Error fetching videos from TMDB',
            message: error.message
        });
    }
});

// Get all TV shows with pagination, filtering, and sorting
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 12;
        const skip = (page - 1) * limit;

        // Build query based on filters
        let query = { type: 'tvshow' };
        
        // Genre filter
        if (req.query.genre) {
            query.genres = req.query.genre;
        }

        // Search filter
        if (req.query.search) {
            query.$or = [
                { title: { $regex: req.query.search, $options: 'i' } },
                { overview: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        // Free content filter for non-premium users
        if (!req.user.isPremium) {
            query.isFree = true;
        }

        // Sort options
        let sort = {};
        switch (req.query.sort) {
            case 'latest':
                sort = { releaseDate: -1 };
                break;
            case 'rating':
                sort = { ratings: -1 };
                break;
            case 'title':
                sort = { title: 1 };
                break;
            default:
                sort = { releaseDate: -1 };
        }

        // Get total count for pagination
        const total = await Content.countDocuments(query);
        const totalPages = Math.ceil(total / limit);

        // Get TV shows
        const tvshows = await Content.find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit);

        // Get all unique genres for filter
        const genres = await Content.distinct('genres', { type: 'tvshow' });

        res.render('tvshows/index', {
            tvshows,
            genres,
            currentPage: page,
            totalPages,
            query: req.query,
            user: req.user
        });
    } catch (error) {
        console.error('Error fetching TV shows:', error);
        res.status(500).json({ error: 'Error fetching TV shows' });
    }
});

// Get TV show details
router.get('/:id', isAuthenticated, async (req, res) => {
    try {
        const tvshow = await Content.findOne({ _id: req.params.id, type: 'tvshow' });
        
        if (!tvshow) {
            return res.status(404).json({ error: 'TV show not found' });
        }

        // Check if user has access to the TV show
        if (!tvshow.isFree && !req.user.isPremium) {
            return res.status(403).json({ error: 'Premium subscription required' });
        }

        // Get similar TV shows
        const similarTvshows = await Content.find({
            type: 'tvshow',
            genres: { $in: tvshow.genres },
            _id: { $ne: tvshow._id }
        })
        .limit(4);

        res.render('tvshows/details', {
            tvshow,
            similarTvshows,
            user: req.user
        });
    } catch (error) {
        console.error('Error fetching TV show details:', error);
        res.status(500).json({ error: 'Error fetching TV show details' });
    }
});

// Watch TV show
router.get('/:id/watch', isAuthenticated, async (req, res) => {
    try {
        const tvshow = await Content.findOne({ _id: req.params.id, type: 'tvshow' });
        
        if (!tvshow) {
            return res.status(404).json({ error: 'TV show not found' });
        }

        // Check if user has access to the TV show
        if (!tvshow.isFree && !req.user.isPremium) {
            return res.status(403).json({ error: 'Premium subscription required' });
        }

        res.render('tvshows/watch', {
            tvshow,
            user: req.user
        });
    } catch (error) {
        console.error('Error accessing TV show:', error);
        res.status(500).json({ error: 'Error accessing TV show' });
    }
});

// Get watchlist
router.get('/watchlist', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate({
            path: 'watchlist',
            match: { type: 'tvshow' }
        });
        
        res.render('tvshows/watchlist', {
            watchlist: user.watchlist,
            user: req.user
        });
    } catch (error) {
        console.error('Error fetching watchlist:', error);
        res.status(500).json({ error: 'Error fetching watchlist' });
    }
});

// Add/Remove from watchlist
router.post('/:id/watchlist', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const tvshowId = req.params.id;

        // Check if TV show exists
        const tvshow = await Content.findOne({ _id: tvshowId, type: 'tvshow' });
        if (!tvshow) {
            return res.status(404).json({ error: 'TV show not found' });
        }

        // Check if TV show is in watchlist
        const isInWatchlist = user.watchlist.includes(tvshowId);

        if (isInWatchlist) {
            // Remove from watchlist
            user.watchlist = user.watchlist.filter(id => id.toString() !== tvshowId);
            await user.save();
            res.json({ 
                message: 'Removed from watchlist',
                inWatchlist: false
            });
        } else {
            // Add to watchlist
            user.watchlist.push(tvshowId);
            await user.save();
            res.json({ 
                message: 'Added to watchlist',
                inWatchlist: true
            });
        }
    } catch (error) {
        console.error('Error updating watchlist:', error);
        res.status(500).json({ error: 'Error updating watchlist' });
    }
});

// Save watch progress
router.post('/:id/progress', isAuthenticated, async (req, res) => {
    try {
        const { progress, season, episode } = req.body;
        const tvshowId = req.params.id;

        // Check if TV show exists
        const tvshow = await Content.findOne({ _id: tvshowId, type: 'tvshow' });
        if (!tvshow) {
            return res.status(404).json({ error: 'TV show not found' });
        }

        // Update or create watch history
        const user = await User.findById(req.user._id);
        const watchHistoryIndex = user.watchHistory.findIndex(
            history => history.content.toString() === tvshowId
        );

        if (watchHistoryIndex === -1) {
            // Create new watch history
            user.watchHistory.push({
                content: tvshowId,
                lastWatched: new Date(),
                progress,
                season: season || 1,
                episode: episode || 1
            });
        } else {
            // Update existing watch history
            user.watchHistory[watchHistoryIndex].lastWatched = new Date();
            user.watchHistory[watchHistoryIndex].progress = progress;
            
            // Only update season and episode if provided
            if (season) user.watchHistory[watchHistoryIndex].season = season;
            if (episode) user.watchHistory[watchHistoryIndex].episode = episode;
        }

        await user.save();
        res.json({ message: 'Progress saved' });
    } catch (error) {
        console.error('Error saving progress:', error);
        res.status(500).json({ error: 'Error saving progress' });
    }
});

// Get watch progress
router.get('/:id/progress', isAuthenticated, async (req, res) => {
    try {
        const tvshowId = req.params.id;
        const user = await User.findById(req.user._id);
        
        const watchHistory = user.watchHistory.find(
            history => history.content.toString() === tvshowId
        );

        res.json({ 
            progress: watchHistory ? watchHistory.progress : 0,
            season: watchHistory ? watchHistory.season : 1,
            episode: watchHistory ? watchHistory.episode : 1
        });
    } catch (error) {
        console.error('Error fetching progress:', error);
        res.status(500).json({ error: 'Error fetching progress' });
    }
});

module.exports = router; 