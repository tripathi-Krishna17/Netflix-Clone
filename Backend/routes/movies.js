const express = require('express');
const router = express.Router();
const Content = require('../models/content');
const User = require('../models/User');
const { isAuthenticated } = require('../middleware/auth');
const axios = require('axios');
const History = require('../models/history');

// Get trending movies from TMDB - putting specific routes BEFORE the dynamic ID routes
router.get('/trending', isAuthenticated, async (req, res) => {
    try {
        // Use the environment variable or fall back to hardcoded API key
        const TMDB_API_KEY = process.env.TMDB_API_KEY || '6ec9180bfc843aba1677d9ff1b531116';
        
        console.log('Using TMDB API key for trending:', TMDB_API_KEY.substring(0, 5) + '...');

        const response = await axios.get(`https://api.themoviedb.org/3/trending/movie/week`, {
            params: {
                api_key: TMDB_API_KEY,
                language: 'en-US'
            },
            timeout: 15000 // Increased timeout to avoid hanging requests
        });

        if (!response.data || !response.data.results) {
            console.error('Invalid response from TMDB API:', response.data);
            return res.status(500).json({ error: 'Invalid response from TMDB API' });
        }

        console.log(`Successfully fetched ${response.data.results.length} trending movies from TMDB`);

        // Transform TMDB results to our app format with null checks
        const trendingMovies = response.data.results.slice(0, 12).map(movie => ({
            id: movie.id,
            tmdbId: movie.id, // Add tmdbId explicitly for client-side features
            title: movie.title || 'Unknown Title',
            overview: movie.overview || 'No overview available',
            posterPath: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
            backdropPath: movie.backdrop_path ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}` : null,
            releaseDate: movie.release_date || 'Unknown',
            ratings: movie.vote_average ? Math.round(movie.vote_average * 10) : 0, // Convert to percentage
            isFree: true // Default trending movies to free to ensure visibility
        }));
        
        // Store in memory cache
        if (!global.trendingMoviesCache) {
            global.trendingMoviesCache = {};
        }
        global.trendingMoviesCache.data = trendingMovies;
        global.trendingMoviesCache.timestamp = Date.now();
        
        res.json(trendingMovies);
    } catch (error) {
        console.error('Error fetching trending movies:', {
            message: error.message,
            code: error.code,
            status: error.response?.status
        });
        
        // Try to use cached data if available
        if (global.trendingMoviesCache && global.trendingMoviesCache.data) {
            console.log('Returning cached trending movies due to API error');
            return res.json(global.trendingMoviesCache.data);
        }
        
        res.status(500).json({ 
            error: 'Error fetching trending movies', 
            message: error.message,
            fallback: true // Signal client to try direct TMDB API if needed
        });
    }
});

// Get movie trailers directly from TMDB by TMDB ID - specific route
router.get('/tmdb/:tmdbId/videos', isAuthenticated, async (req, res) => {
    try {
        // Use the environment variable or fall back to hardcoded API key
        const TMDB_API_KEY = process.env.TMDB_API_KEY || '6ec9180bfc843aba1677d9ff1b531116';
        const tmdbId = req.params.tmdbId;
        
        console.log(`Fetching videos directly from TMDB for ID: ${tmdbId}`);
        
        const response = await axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}/videos`, {
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
        
        console.log(`Found ${videos.length} videos for TMDB ID: ${tmdbId}`);
        res.json(videos);
    } catch (error) {
        console.error('Error fetching videos directly from TMDB:', error.message);
        res.status(500).json({ 
            error: 'Error fetching videos from TMDB',
            message: error.message
        });
    }
});

// Route to handle TMDB movie details when we don't have them in our database
router.get('/tmdb/:tmdbId', isAuthenticated, async (req, res) => {
    try {
        const tmdbId = req.params.tmdbId;
        console.log(`Getting movie details for TMDB ID: ${tmdbId}`);
        
        // Check if we have this movie in our database already
        const existingMovie = await Content.findOne({ tmdbId: tmdbId });
        if (existingMovie) {
            // If it exists in our database, redirect to the regular movie route
            return res.redirect(`/movies/${existingMovie._id}`);
        }
        
        // Otherwise fetch from TMDB directly
        const TMDB_API_KEY = process.env.TMDB_API_KEY || '6ec9180bfc843aba1677d9ff1b531116';
        
        // Get movie details from TMDB
        const response = await axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}`, {
            params: {
                api_key: TMDB_API_KEY,
                language: 'en-US',
                append_to_response: 'videos,credits'
            },
            timeout: 10000
        });
        
        if (!response.data) {
            console.error('Invalid response from TMDB API');
            return res.status(404).render('404', { 
                message: 'Movie not found', 
                user: req.user 
            });
        }
        
        // Transform TMDB data to our app format with null checks
        const movie = {
            tmdbId: response.data.id,
            title: response.data.title || 'Unknown Title',
            overview: response.data.overview || 'No overview available',
            posterPath: response.data.poster_path ? `https://image.tmdb.org/t/p/w500${response.data.poster_path}` : null,
            backdropPath: response.data.backdrop_path ? `https://image.tmdb.org/t/p/original${response.data.backdrop_path}` : null,
            releaseDate: response.data.release_date || 'Unknown',
            ratings: response.data.vote_average ? Math.round(response.data.vote_average * 10) : 0,
            runtime: response.data.runtime || 0,
            genres: response.data.genres ? response.data.genres.map(g => g.name) : [],
            isFree: true, // Consider all direct TMDB content as free to view
            
            // Extract video URLs if available
            videos: response.data.videos && response.data.videos.results ? 
                response.data.videos.results.map(v => ({
                    key: v.key,
                    site: v.site,
                    type: v.type,
                    name: v.name
                })) : [],
                
            // Get trailer URL if available
            videoUrl: response.data.videos && response.data.videos.results && response.data.videos.results.length > 0 ? 
                `https://www.youtube.com/embed/${response.data.videos.results[0].key}` : null,
                
            // Extract cast if available
            cast: response.data.credits && response.data.credits.cast ? 
                response.data.credits.cast.slice(0, 10).map(actor => ({
                    name: actor.name,
                    character: actor.character,
                    profilePath: actor.profile_path ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` : null
                })) : []
        };
        
        // Get similar movies based on genres
        const similarMovies = [];
        if (movie.genres.length > 0) {
            try {
                const similarResponse = await axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}/similar`, {
                    params: {
                        api_key: TMDB_API_KEY,
                        language: 'en-US',
                        page: 1
                    },
                    timeout: 8000
                });
                
                if (similarResponse.data && similarResponse.data.results) {
                    similarMovies.push(...similarResponse.data.results.slice(0, 4).map(m => ({
                        tmdbId: m.id,
                        title: m.title || 'Unknown Title',
                        posterPath: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
                        ratings: m.vote_average ? Math.round(m.vote_average * 10) : 0,
                        releaseDate: m.release_date || 'Unknown'
                    })));
                }
            } catch (error) {
                console.error('Error fetching similar movies from TMDB:', error.message);
                // Continue without similar movies if this fails
            }
        }
        
        // Check if user has this in their watchlist
        let inWatchlist = false;
        if (req.user) {
            const user = await User.findById(req.user._id);
            if (user) {
                // Look for a movie in watchlist with matching tmdbId
                const movieInWatchlist = await Content.findOne({
                    _id: { $in: user.watchlist },
                    tmdbId: tmdbId
                });
                inWatchlist = !!movieInWatchlist;
            }
        }
        
        // Render the movie details page with the TMDB data
        res.render('movies/tmdbDetails', {
            movie,
            similarMovies,
            isFromTMDB: true,
            inWatchlist,
            user: req.user
        });
    } catch (error) {
        console.error('Error fetching movie from TMDB:', error.message);
        res.status(500).render('error', { 
            message: 'Error loading movie details', 
            error: error,
            user: req.user 
        });
    }
});

// Get watchlist - specific route
router.get('/watchlist', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate('watchlist');
        res.render('movies/watchlist', {
            watchlist: user.watchlist,
            user: req.user
        });
    } catch (error) {
        console.error('Error fetching watchlist:', error);
        res.status(500).json({ error: 'Error fetching watchlist' });
    }
});

// Get all movies with pagination, filtering, and sorting
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 12;
        const skip = (page - 1) * limit;
        
        // Log search query for debugging
        console.log('Search query:', req.query);

        // Build query based on filters
        let query = { type: 'movie' };
        
        // Genre filter
        if (req.query.genre) {
            query.genres = req.query.genre;
        }

        // Search filter
        if (req.query.search) {
            const searchTerm = req.query.search.trim();
            console.log('Searching for term:', searchTerm);
            
            query.$or = [
                { title: { $regex: searchTerm, $options: 'i' } },
                { overview: { $regex: searchTerm, $options: 'i' } }
            ];
            
            // Check for exact title match for debugging
            const exactMatch = await Content.findOne({
                type: 'movie',
                title: new RegExp(`^${searchTerm}$`, 'i')
            });
            
            if (exactMatch) {
                console.log('Found exact match:', {
                    id: exactMatch._id,
                    title: exactMatch.title,
                    hasVideo: !!exactMatch.videoUrl,
                    videoUrl: exactMatch.videoUrl
                });
            } else {
                console.log('No exact match found for:', searchTerm);
            }
        }

        // Free content filter for non-premium users
        if (!req.user.isPremium) {
            query.isFree = true;
            console.log('User is not premium, filtering to free content only');
        } else {
            console.log('User is premium, showing all content');
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

        // Get movies with videoUrl included in projection
        const movies = await Content.find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .select('title overview posterPath backdropPath videoUrl releaseDate ratings genres isFree');
            
        // Log movie video URLs to debug
        console.log(`Found ${movies.length} movies in search results`);
        movies.forEach(m => {
            console.log(`- ${m.title} | Has video: ${!!m.videoUrl} | URL: ${m.videoUrl || 'none'}`);
        });

        // Get all unique genres for filter
        const genres = await Content.distinct('genres', { type: 'movie' });

        res.render('movies/index', {
            movies,
            genres,
            currentPage: page,
            totalPages,
            query: req.query,
            user: req.user
        });
    } catch (error) {
        console.error('Error fetching movies:', error);
        res.status(500).json({ error: 'Error fetching movies' });
    }
});

// NOW include the dynamic ID routes

// Get movie details
router.get('/:id', isAuthenticated, async (req, res) => {
    try {
        const movie = await Content.findOne({ _id: req.params.id, type: 'movie' });
        
        if (!movie) {
            return res.status(404).json({ error: 'Movie not found' });
        }

        // Check if user has access to the movie
        if (!movie.isFree && !req.user.isPremium) {
            return res.status(403).json({ error: 'Premium subscription required' });
        }

        // Get similar movies
        const similarMovies = await Content.find({
            type: 'movie',
            genres: { $in: movie.genres },
            _id: { $ne: movie._id }
        })
        .limit(4);

        res.render('movies/details', {
            movie,
            similarMovies,
            user: req.user
        });
    } catch (error) {
        console.error('Error fetching movie details:', error);
        res.status(500).json({ error: 'Error fetching movie details' });
    }
});

// GET route to watch a movie
router.get('/:id/watch', isAuthenticated, async (req, res) => {
    try {
        // Find the movie by ID
        const movie = await Content.findById(req.params.id);
        
        // If movie doesn't exist, return 404
        if (!movie) {
            return res.status(404).render('errors/no-video', {
                user: req.user,
                message: "Movie not found. It may have been removed or is unavailable."
            });
        }
        
        // Check if this is premium content and user has access
        if (movie.isPremium && !req.user.isPremium) {
            // If not premium user, redirect to subscription page or offer upgrade
            return res.render('subscription/upgrade', {
                user: req.user,
                message: "This is premium content. Please upgrade to access."
            });
        }
        
        // If movie doesn't have a video URL, render the error page
        if (!movie.videoUrl) {
            return res.render('errors/no-video', {
                user: req.user,
                movie: movie,
                message: "Sorry, the video for this movie is currently unavailable."
            });
        }
        
        // Record that the user has started watching this movie
        // Only add to watched list if not already there
        const userHistory = await History.findOne({ user: req.user._id });
        
        if (userHistory) {
            // Check if this movie is already in the watched list
            const alreadyWatched = userHistory.watched.some(item => 
                item.content.toString() === movie._id.toString()
            );
            
            if (!alreadyWatched) {
                userHistory.watched.push({
                    content: movie._id,
                    timestamp: Date.now(),
                    progress: 0
                });
                await userHistory.save();
            }
        } else {
            // Create new history record for this user
            await History.create({
                user: req.user._id,
                watched: [{
                    content: movie._id,
                    timestamp: Date.now(),
                    progress: 0
                }]
            });
        }
        
        // Render the watch view with the movie data
        res.render('movies/watch', {
            user: req.user,
            movie: movie,
            videoUrl: movie.videoUrl,
            isYouTube: movie.videoUrl.includes('youtube.com') || movie.videoUrl.includes('youtu.be')
        });
        
    } catch (error) {
        console.error('Error watching movie:', error);
        res.status(500).render('errors/no-video', {
            user: req.user,
            message: "An error occurred while trying to load the movie. Please try again later."
        });
    }
});

// Watch movie with enhanced Three.js experience for free content
router.get('/:id/watch-free', isAuthenticated, async (req, res) => {
    try {
        const movie = await Content.findOne({ _id: req.params.id, type: 'movie' });
        
        if (!movie) {
            return res.status(404).json({ error: 'Movie not found' });
        }

        // Check if user has access to the movie
        if (!movie.isFree && !req.user.isPremium) {
            return res.status(403).render('errors/premium-required', {
                message: 'This content requires a premium subscription',
                user: req.user
            });
        }

        // For free users, use the enhanced watch page with Three.js
        res.render('movies/free-watch', {
            movie,
            user: req.user
        });
    } catch (error) {
        console.error('Error accessing movie:', error);
        res.status(500).json({ error: 'Error accessing movie' });
    }
});

// Add/Remove from watchlist
router.post('/:id/watchlist', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const movieId = req.params.id;

        // Check if movie exists
        const movie = await Content.findOne({ _id: movieId, type: 'movie' });
        if (!movie) {
            return res.status(404).json({ error: 'Movie not found' });
        }

        // Check if movie is in watchlist
        const isInWatchlist = user.watchlist.includes(movieId);

        if (isInWatchlist) {
            // Remove from watchlist
            user.watchlist = user.watchlist.filter(id => id.toString() !== movieId);
            await user.save();
            res.json({ 
                message: 'Removed from watchlist',
                inWatchlist: false
            });
        } else {
            // Add to watchlist
            user.watchlist.push(movieId);
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
        const { progress } = req.body;
        const movieId = req.params.id;

        // Check if movie exists
        const movie = await Content.findOne({ _id: movieId, type: 'movie' });
        if (!movie) {
            return res.status(404).json({ error: 'Movie not found' });
        }

        // Update or create watch history
        const user = await User.findById(req.user._id);
        const watchHistoryIndex = user.watchHistory.findIndex(
            history => history.content.toString() === movieId
        );

        if (watchHistoryIndex === -1) {
            // Create new watch history
            user.watchHistory.push({
                content: movieId,
                lastWatched: new Date(),
                progress
            });
        } else {
            // Update existing watch history
            user.watchHistory[watchHistoryIndex].lastWatched = new Date();
            user.watchHistory[watchHistoryIndex].progress = progress;
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
        const movieId = req.params.id;
        const user = await User.findById(req.user._id);
        
        const watchHistory = user.watchHistory.find(
            history => history.content.toString() === movieId
        );

        res.json({ progress: watchHistory ? watchHistory.progress : 0 });
    } catch (error) {
        console.error('Error fetching progress:', error);
        res.status(500).json({ error: 'Error fetching progress' });
    }
});

// Get movie recommendations from TMDB
router.get('/:id/recommendations', isAuthenticated, async (req, res) => {
    try {
        // Use the environment variable or fall back to hardcoded API key
        const TMDB_API_KEY = process.env.TMDB_API_KEY || '6ec9180bfc843aba1677d9ff1b531116';
        
        console.log('Using TMDB API key for recommendations:', TMDB_API_KEY.substring(0, 5) + '...');

        const movie = await Content.findOne({ _id: req.params.id, type: 'movie' });
        
        if (!movie) {
            return res.status(404).json({ error: 'Movie not found' });
        }

        // If we have tmdbId, use it to get recommendations
        if (movie.tmdbId) {
            try {
                const response = await axios.get(`https://api.themoviedb.org/3/movie/${movie.tmdbId}/recommendations`, {
                    params: {
                        api_key: TMDB_API_KEY,
                        language: 'en-US',
                        page: 1
                    },
                    timeout: 10000 // Adding timeout to avoid hanging requests
                });

                if (response.data && response.data.results) {
                    // Transform TMDB results to our app format
                    const recommendations = response.data.results.slice(0, 6).map(movie => ({
                        id: movie.id,
                        title: movie.title || 'Unknown Title',
                        overview: movie.overview || 'No overview available',
                        posterPath: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
                        backdropPath: movie.backdrop_path ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}` : null,
                        releaseDate: movie.release_date || 'Unknown',
                        ratings: movie.vote_average || 0
                    }));
                    
                    console.log(`Found ${recommendations.length} TMDB recommendations for movie: ${movie.title}`);
                    return res.json(recommendations);
                }
            } catch (error) {
                console.error('Error fetching recommendations from TMDB:', error.message);
                // If TMDB fails, fall back to local recommendations
            }
        }

        // Fallback to local recommendations based on genres
        const similarMovies = await Content.find({
            type: 'movie',
            genres: { $in: movie.genres },
            _id: { $ne: movie._id }
        })
        .limit(6)
        .select('title overview posterPath backdropPath releaseDate ratings');

        console.log(`Found ${similarMovies.length} local recommendations for movie: ${movie.title}`);
        res.json(similarMovies);
    } catch (error) {
        console.error('Error fetching movie recommendations:', error.message);
        res.status(500).json({ 
            error: 'Error fetching movie recommendations',
            message: error.message 
        });
    }
});

// Get movie trailers from TMDB
router.get('/:id/videos', isAuthenticated, async (req, res) => {
    try {
        // Use the environment variable or fall back to hardcoded API key
        const TMDB_API_KEY = process.env.TMDB_API_KEY || '6ec9180bfc843aba1677d9ff1b531116';
        
        console.log('Using TMDB API key for videos:', TMDB_API_KEY.substring(0, 5) + '...');

        const movie = await Content.findOne({ _id: req.params.id, type: 'movie' });
        
        if (!movie) {
            return res.status(404).json({ error: 'Movie not found' });
        }

        // If we have tmdbId, use it to get videos
        if (movie.tmdbId) {
            try {
                const response = await axios.get(`https://api.themoviedb.org/3/movie/${movie.tmdbId}/videos`, {
                    params: {
                        api_key: TMDB_API_KEY,
                        language: 'en-US'
                    },
                    timeout: 10000 // Adding timeout to avoid hanging requests
                });

                if (response.data && response.data.results) {
                    const videos = response.data.results.map(video => ({
                        id: video.id,
                        key: video.key,
                        name: video.name || '',
                        site: video.site || '',
                        type: video.type || ''
                    }));
                    
                    console.log(`Found ${videos.length} videos for movie: ${movie.title}`);
                    return res.json(videos);
                }
            } catch (error) {
                console.error('Error fetching videos from TMDB:', error.message);
                // If TMDB fails, return empty array
            }
        }

        res.json([]);
    } catch (error) {
        console.error('Error fetching movie videos:', error.message);
        res.status(500).json({ 
            error: 'Error fetching movie videos',
            message: error.message 
        });
    }
});

// Handle watchlist updates for TMDB movies
router.post('/tmdb/:tmdbId/watchlist', isAuthenticated, async (req, res) => {
    try {
        const tmdbId = req.params.tmdbId;
        const user = await User.findById(req.user._id);
        
        // Check if we already have this movie in our database
        let movie = await Content.findOne({ tmdbId: tmdbId });
        
        // If not, fetch from TMDB and create a basic entry
        if (!movie) {
            const TMDB_API_KEY = process.env.TMDB_API_KEY || '6ec9180bfc843aba1677d9ff1b531116';
            
            // Get basic movie details from TMDB
            const response = await axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}`, {
                params: {
                    api_key: TMDB_API_KEY,
                    language: 'en-US'
                },
                timeout: 8000
            });
            
            if (!response.data) {
                throw new Error('Invalid response from TMDB API');
            }
            
            // Create a new entry in our database
            movie = new Content({
                tmdbId: response.data.id,
                type: 'movie',
                title: response.data.title || 'Unknown Title',
                overview: response.data.overview || 'No overview available',
                posterPath: response.data.poster_path ? `https://image.tmdb.org/t/p/w500${response.data.poster_path}` : null,
                backdropPath: response.data.backdrop_path ? `https://image.tmdb.org/t/p/original${response.data.backdrop_path}` : null,
                releaseDate: response.data.release_date || 'Unknown',
                ratings: response.data.vote_average ? Math.round(response.data.vote_average * 10) : 0,
                runtime: response.data.runtime || 0,
                genres: response.data.genres ? response.data.genres.map(g => g.name) : [],
                isFree: true, // Consider all TMDB content as free by default
                trending: false,
                createdAt: new Date()
            });
            
            await movie.save();
            console.log(`Created new movie entry from TMDB: ${movie.title} (ID: ${movie._id})`);
        }
        
        // Check if movie is in watchlist
        const isInWatchlist = user.watchlist.some(id => id.toString() === movie._id.toString());
        
        if (isInWatchlist) {
            // Remove from watchlist
            user.watchlist = user.watchlist.filter(id => id.toString() !== movie._id.toString());
            await user.save();
            res.json({ 
                message: 'Removed from watchlist',
                inWatchlist: false
            });
        } else {
            // Add to watchlist
            user.watchlist.push(movie._id);
            await user.save();
            res.json({ 
                message: 'Added to watchlist',
                inWatchlist: true
            });
        }
    } catch (error) {
        console.error('Error updating watchlist for TMDB movie:', error.message);
        res.status(500).json({ error: 'Error updating watchlist', message: error.message });
    }
});

// GET route to watch a TMDB movie
router.get('/tmdb/:tmdbId/watch', isAuthenticated, async (req, res) => {
    try {
        // Get the TMDB ID from the URL parameter
        const tmdbId = req.params.tmdbId;
        console.log(`Fetching video for TMDB movie: ${tmdbId}`);

        // Check if movie exists in our database
        const existingMovie = await Content.findOne({ tmdbId });
        if (existingMovie) {
            // If the movie exists in our database, redirect to the regular watch route
            return res.redirect(`/movies/${existingMovie._id}/watch`);
        }

        // Fetch movie details from TMDB API
        const apiKey = process.env.TMDB_API_KEY;
        const [movieResponse, videosResponse] = await Promise.all([
            axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}`),
            axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${apiKey}`)
        ]);

        const movieData = movieResponse.data;
        const videosData = videosResponse.data;

        // Prepare movie data for rendering
        const movie = {
            tmdbId: movieData.id,
            title: movieData.title,
            overview: movieData.overview,
            posterPath: movieData.poster_path ? `https://image.tmdb.org/t/p/w500${movieData.poster_path}` : null,
            backdropPath: movieData.backdrop_path ? `https://image.tmdb.org/t/p/original${movieData.backdrop_path}` : null,
            releaseDate: movieData.release_date,
            ratings: movieData.vote_average * 10, // Convert to percentage
            runtime: movieData.runtime,
            genres: movieData.genres.map(genre => genre.name).join(', ')
        };

        // Find a suitable video - prioritize official trailers
        let videoUrl = null;
        let videoKey = null;

        if (videosData.results && videosData.results.length > 0) {
            // First try to find official trailer
            const trailer = videosData.results.find(
                video => video.type === 'Trailer' && video.official === true
            );

            // If no official trailer, try any trailer
            const anyTrailer = trailer || videosData.results.find(
                video => video.type === 'Trailer'
            );

            // If no trailer, use the first video
            const video = anyTrailer || videosData.results[0];
            
            if (video) {
                videoKey = video.key;
                videoUrl = `https://www.youtube.com/embed/${video.key}?autoplay=1`;
            }
        }

        // If no video is available, render error page
        if (!videoUrl) {
            return res.render('errors/no-video', {
                user: req.user,
                movie: movie,
                message: "Sorry, there is no trailer or video available for this movie."
            });
        }

        // Render the watch view with the movie data
        res.render('movies/watch', {
            user: req.user,
            movie: movie,
            videoUrl: videoUrl,
            videoKey: videoKey,
            isYouTube: true // Flag to indicate this is a YouTube video
        });

    } catch (error) {
        console.error('Error watching TMDB movie:', error);
        res.status(500).render('errors/no-video', {
            user: req.user,
            message: "An error occurred while trying to fetch the movie video. Please try again later.",
            movie: {
                tmdbId: req.params.tmdbId,
                title: "Unknown Movie"
            }
        });
    }
});

module.exports = router; 