const express = require('express');
const router = express.Router();
const Content = require('../models/content');
const User = require('../models/User');
const { isAuthenticated } = require('../middleware/auth');

// Middleware to check if user is authenticated and is admin
const isAdmin = (req, res, next) => {
    if (req.isAuthenticated() && req.user.isAdmin) {
        return next();
    }
    res.redirect('/admin/login');
};

// Dashboard home page
router.get('/admin/dashboard', isAdmin, async (req, res) => {
    try {
        const stats = {
            totalMovies: await Content.countDocuments({ type: 'movie' }),
            totalUsers: await User.countDocuments(),
            recentMovies: await Content.find({ type: 'movie' })
                .sort({ releaseDate: -1 })
                .limit(8),
            recentUsers: await User.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .select('-password'),
            movies: await Content.find({ type: 'movie' })
                .sort({ releaseDate: -1 })
                .limit(12),
            tvshows: await Content.find({ type: 'tv' })
                .sort({ releaseDate: -1 })
                .limit(12)
        };
        res.render('dashboard', { stats, user: req.user });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).render('dashboard', { 
            error: 'Error loading dashboard data',
            user: req.user 
        });
    }
});

// Watch movie
router.get('/admin/movies/:id/watch', isAdmin, async (req, res) => {
    try {
        const movie = await Content.findOne({ _id: req.params.id, type: 'movie' });
        
        if (!movie) {
            return res.status(404).json({ error: 'Movie not found' });
        }

        // If movie doesn't have a video URL, render the error page
        if (!movie.videoUrl) {
            return res.render('errors/no-video', {
                user: req.user,
                movie: movie,
                message: "Sorry, the video for this movie is currently unavailable."
            });
        }

        // For remote videos from SFTP, offer alternative players
        if (movie.videoUrl.startsWith('/remote-videos/')) {
            const filename = movie.videoUrl.replace('/remote-videos/', '');
            const isMkvFile = filename.toLowerCase().endsWith('.mkv');
            
            // For MKV files, offer transcoding option
            if (isMkvFile && req.query.player === 'transcode') {
                return res.redirect(`/remote-videos/transcode/${filename}`);
            }
            
            // Query param for fallback
            if (req.query.player === 'direct') {
                return res.redirect(`/remote-videos/direct-test/${filename}?id=${movie._id}`);
            }
            
            if (req.query.player === 'debug') {
                return res.redirect(`/remote-videos/test-player/${filename}`);
            }
            
            // Native HTML5 player option
            if (req.query.player === 'native') {
                return res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>${movie.title} - Native Player</title>
                        <style>
                            body { background: #000; color: #fff; margin: 0; font-family: Arial, sans-serif; }
                            .video-container { width: 100%; height: 80vh; }
                            video { width: 100%; height: 100%; }
                            .controls { padding: 20px; }
                            button { padding: 10px; margin: 5px; cursor: pointer; }
                        </style>
                    </head>
                    <body>
                        <div class="video-container">
                            <video id="player" controls autoplay>
                                <source src="${movie.videoUrl}" type="video/mp4">
                                <source src="${movie.videoUrl}" type="video/webm">
                                <source src="${movie.videoUrl}" type="video/x-matroska">
                                Your browser does not support the video tag.
                            </video>
                        </div>
                        <div class="controls">
                            <h2>${movie.title}</h2>
                            <p>Using native HTML5 player (no libraries)</p>
                            <button onclick="document.getElementById('player').src='/remote-videos/direct/${filename}'">Try Direct URL</button>
                            <button onclick="document.getElementById('player').src='https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'">Load Sample Video</button>
                            <button onclick="window.location.href='/admin/movies/${movie._id}/watch'">Back to Normal Player</button>
                        </div>
                        <script>
                            const video = document.getElementById('player');
                            
                            video.addEventListener('error', function(e) {
                                console.error('Video loading error:', e);
                                alert('Error loading video. Try using one of the alternative options below.');
                            });
                            
                            video.addEventListener('loadstart', () => console.log('Video loading started'));
                            video.addEventListener('loadedmetadata', () => console.log('Metadata loaded, duration:', video.duration));
                            video.addEventListener('canplay', () => console.log('Video can play now'));
                        </script>
                    </body>
                    </html>
                `);
            }
            
            // Add direct option to check
            if (req.query.player === 'direct-sample') {
                return res.redirect(`/remote-videos/direct/${filename}`);
            }
            
            // Add debug info to videoUrl for troubleshooting
            return res.render('movies/watch', {
                movie,
                user: req.user,
                videoUrl: movie.videoUrl,
                isYouTube: movie.videoUrl.includes('youtube.com') || movie.videoUrl.includes('youtu.be'),
                isMkvFile: isMkvFile,
                fallbackOptions: {
                    direct: `/admin/movies/${movie._id}/watch?player=direct`,
                    debug: `/admin/movies/${movie._id}/watch?player=debug`,
                    native: `/admin/movies/${movie._id}/watch?player=native`,
                    directSample: `/admin/movies/${movie._id}/watch?player=direct-sample`,
                    transcode: isMkvFile ? `/admin/movies/${movie._id}/watch?player=transcode` : null,
                    fallbackVideo: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
                }
            });
        }

        // For regular videos (YouTube, direct URLs)
        res.render('movies/watch', {
            movie,
            user: req.user,
            videoUrl: movie.videoUrl,
            isYouTube: movie.videoUrl.includes('youtube.com') || movie.videoUrl.includes('youtu.be')
        });
    } catch (error) {
        console.error('Error accessing movie:', error);
        res.status(500).json({ error: 'Error accessing movie' });
    }
});

// Admin test route for debugging video issues
router.get('/admin/movies/:id/watch-debug', isAdmin, async (req, res) => {
    try {
        const movie = await Content.findOne({ _id: req.params.id, type: 'movie' });
        
        if (!movie) {
            return res.status(404).json({ error: 'Movie not found' });
        }

        // If movie doesn't have a video URL, show error
        if (!movie.videoUrl) {
            return res.json({
                error: 'No video URL',
                movieId: movie._id,
                title: movie.title
            });
        }

        // If it's a remote video, redirect to test player
        if (movie.videoUrl.startsWith('/remote-videos/')) {
            const filename = movie.videoUrl.replace('/remote-videos/', '');
            return res.redirect(`/remote-videos/test-player/${filename}`);
        }

        // Otherwise show video details
        res.json({
            title: movie.title,
            videoUrl: movie.videoUrl,
            isYouTube: movie.videoUrl.includes('youtube.com') || movie.videoUrl.includes('youtu.be'),
            type: movie.videoUrl.endsWith('.mp4') ? 'MP4' : 
                 movie.videoUrl.endsWith('.mkv') ? 'MKV' : 'Unknown',
            directLink: `<a href="${movie.videoUrl}" target="_blank">Open direct link</a>`
        });
    } catch (error) {
        console.error('Error accessing movie debug:', error);
        res.status(500).json({ error: 'Error accessing movie debug information' });
    }
});

// Watch TV show
router.get('/admin/tvshows/:id/watch', isAdmin, async (req, res) => {
    try {
        const tvshow = await Content.findOne({ _id: req.params.id, type: 'tv' });
        
        if (!tvshow) {
            return res.status(404).json({ error: 'TV Show not found' });
        }

        // If TV show doesn't have a video URL, render the error page
        if (!tvshow.videoUrl) {
            return res.render('errors/no-video', {
                user: req.user,
                movie: tvshow, // Using the same template for both movies and TV shows
                message: "Sorry, the video for this TV show is currently unavailable."
            });
        }

        res.render('tvshows/watch', {
            tvshow,
            user: req.user,
            videoUrl: tvshow.videoUrl,
            isYouTube: tvshow.videoUrl.includes('youtube.com') || tvshow.videoUrl.includes('youtu.be')
        });
    } catch (error) {
        console.error('Error accessing TV show:', error);
        res.status(500).json({ error: 'Error accessing TV show' });
    }
});

// Add new movie
router.post('/admin/movies/add', isAdmin, async (req, res) => {
    try {
        const newMovie = new Content(req.body);
        await newMovie.save();
        res.json({ success: true, movie: newMovie });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update movie
router.put('/admin/movies/:id', isAdmin, async (req, res) => {
    try {
        const updatedMovie = await Content.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json({ success: true, movie: updatedMovie });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete movie
router.delete('/admin/movies/:id', isAdmin, async (req, res) => {
    try {
        await Content.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all movies
router.get('/admin/movies', isAdmin, async (req, res) => {
    try {
        const movies = await Content.find();
        res.json({ success: true, movies });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all users
router.get('/admin/users', isAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update user role
router.put('/admin/users/:id/role', isAdmin, async (req, res) => {
    try {
        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            { isAdmin: req.body.isAdmin },
            { new: true }
        ).select('-password');
        res.json({ success: true, user: updatedUser });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single movie
router.get('/admin/movies/:id', isAdmin, async (req, res) => {
    try {
        const movie = await Content.findById(req.params.id);
        if (!movie) {
            return res.status(404).json({ success: false, error: 'Movie not found' });
        }
        res.json({ success: true, movie });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// User Dashboard - For regular non-admin users
router.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        // Default empty arrays for collections
        let featuredMovies = [];
        let trendingMovies = [];
        let latestMovies = [];
        let recommendedMovies = [];
        let watchHistory = [];
        let watchlist = [];
        
        try {
            // Get user watchlist
            const user = await User.findById(req.user._id).populate('watchlist');
            watchlist = user.watchlist || [];
            
            // Create base query for movies - ensure premium users can see all, non-premium only free content
            let query = { type: 'movie' };
            if (!req.user.isPremium) {
                query.isFree = true;
            }
            
            // Get data for the user dashboard
            const results = await Promise.allSettled([
                // Featured movies for main banner
                Content.find({ ...query, featured: true })
                    .sort({ releaseDate: -1 })
                    .limit(5),
                    
                // Trending movies
                Content.find({ ...query, trending: true })
                    .sort({ ratings: -1 })
                    .limit(12)
                    .then(movies => {
                        // Transform to ensure consistent format with trending API
                        return movies.map(movie => {
                            const m = movie.toObject();
                            // Make sure ratings are in percentage format (0-100)
                            if (typeof m.ratings === 'number' && m.ratings <= 10) {
                                m.ratings = Math.round(m.ratings * 10);
                            }
                            return m;
                        });
                    }),
                    
                // Recently added movies
                Content.find(query)
                    .sort({ createdAt: -1 })
                    .limit(12),
                    
                // User's watch history - populate with content details
                User.findById(req.user._id)
                    .populate({
                        path: 'watchHistory.content',
                        model: 'Content'
                    })
                    .then(user => {
                        if (user && user.watchHistory) {
                            return user.watchHistory
                                .filter(item => item.content) // Filter out any items with null content
                                .sort((a, b) => b.lastWatched - a.lastWatched)
                                .slice(0, 12);
                        }
                        return [];
                    })
            ]);
            
            // Extract results, providing fallbacks for any failed promises
            if (results[0].status === 'fulfilled') featuredMovies = results[0].value;
            if (results[1].status === 'fulfilled') trendingMovies = results[1].value;
            if (results[2].status === 'fulfilled') latestMovies = results[2].value;
            if (results[3].status === 'fulfilled') watchHistory = results[3].value;
            
            // Get recommended movies based on user's watchlist genres
            if (watchlist.length > 0) {
                // Extract genres from user's watchlist
                const userGenres = watchlist.reduce((genres, movie) => {
                    return [...genres, ...(movie.genres || [])];
                }, []);
                
                // Get unique genres
                const uniqueGenres = [...new Set(userGenres)];
                
                // Find movies with matching genres
                if (uniqueGenres.length > 0) {
                    recommendedMovies = await Content.find({
                        ...query,
                        genres: { $in: uniqueGenres },
                        _id: { $nin: watchlist.map(m => m._id) } // Exclude movies already in watchlist
                    })
                    .sort({ ratings: -1 })
                    .limit(12);
                }
            }
            
            // If no recommendations based on watchlist, get top-rated movies instead
            if (recommendedMovies.length === 0) {
                recommendedMovies = await Content.find(query)
                    .sort({ ratings: -1 })
                    .limit(12);
            }
        } catch (error) {
            console.error('Error fetching content:', error);
            // We'll continue with empty arrays rather than failing completely
        }
        
        // Render the dashboard view
        res.render('userDashboard', {
            featuredMovies,
            trendingMovies,
            latestMovies,
            recommendedMovies,
            watchlist,
            watchHistory,
            user: req.user
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).render('userDashboard', { 
            error: 'Error loading dashboard data',
            user: req.user 
        });
    }
});

// My List page
router.get('/mylist', isAuthenticated, async (req, res) => {
    try {
        // Get user's watchlist with populated movie details
        const user = await User.findById(req.user._id).populate('watchlist');
        
        res.render('userWatchlist', {
            watchlist: user.watchlist,
            user: req.user
        });
    } catch (error) {
        console.error('Watchlist error:', error);
        res.status(500).render('userWatchlist', { 
            error: 'Error loading watchlist data',
            user: req.user 
        });
    }
});

// Add a custom debug route for the blank screen issue
router.get('/admin/movies/:id/blank-debug', isAdmin, async (req, res) => {
    try {
        const movie = await Content.findOne({ _id: req.params.id, type: 'movie' });
        
        if (!movie) {
            return res.status(404).json({ error: 'Movie not found' });
        }

        // Send a simplified HTML page with basic video player
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Debug: ${movie.title}</title>
                <style>
                    body { background: #000; color: #fff; font-family: Arial, sans-serif; padding: 20px; }
                    #videoContainer { width: 100%; max-width: 800px; margin: 0 auto; }
                    video { width: 100%; }
                    pre { background: #333; padding: 10px; overflow: auto; }
                    button { padding: 10px; margin: 5px; cursor: pointer; }
                </style>
            </head>
            <body>
                <h1>Debug View for: ${movie.title}</h1>
                <div id="videoContainer">
                    <h2>Movie Details:</h2>
                    <pre id="movieDetails">${JSON.stringify(movie, null, 2)}</pre>
                    
                    <h2>HTML5 Video Player:</h2>
                    <video id="videoPlayer" controls>
                        <source src="${movie.videoUrl}" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>
                    
                    <h2>Controls:</h2>
                    <div>
                        <button onclick="loadSampleVideo()">Load Sample Video</button>
                        <button onclick="window.location.href='${movie.videoUrl}'">Direct Link</button>
                        <button onclick="window.location.href='/admin/movies/${movie._id}/watch?player=native'">Try Native Player</button>
                        <button onclick="window.location.href='/admin/movies/${movie._id}/watch?player=direct'">Try Direct Player</button>
                    </div>
                    
                    <h2>Console Output:</h2>
                    <pre id="consoleOutput"></pre>
                </div>
                
                <script>
                    // Capture console output
                    const originalConsole = { 
                        log: console.log,
                        error: console.error,
                        warn: console.warn,
                        info: console.info
                    };
                    
                    function updateConsole(type, args) {
                        const consoleOutput = document.getElementById('consoleOutput');
                        const time = new Date().toLocaleTimeString();
                        const message = Array.from(args).join(' ');
                        consoleOutput.innerHTML += \`[\${time}] [\${type}] \${message}\\n\`;
                        consoleOutput.scrollTop = consoleOutput.scrollHeight;
                    }
                    
                    console.log = function() { 
                        updateConsole('LOG', arguments);
                        originalConsole.log.apply(console, arguments);
                    };
                    
                    console.error = function() {
                        updateConsole('ERROR', arguments);
                        originalConsole.error.apply(console, arguments);
                    };
                    
                    console.warn = function() {
                        updateConsole('WARN', arguments);
                        originalConsole.warn.apply(console, arguments);
                    };
                    
                    console.info = function() {
                        updateConsole('INFO', arguments);
                        originalConsole.info.apply(console, arguments);
                    };
                    
                    // Debug video events
                    const video = document.getElementById('videoPlayer');
                    
                    video.addEventListener('loadstart', () => console.log('Video: loadstart event'));
                    video.addEventListener('durationchange', () => console.log('Video: durationchange event, duration:', video.duration));
                    video.addEventListener('loadedmetadata', () => console.log('Video: loadedmetadata event'));
                    video.addEventListener('loadeddata', () => console.log('Video: loadeddata event'));
                    video.addEventListener('progress', () => console.log('Video: progress event'));
                    video.addEventListener('canplay', () => console.log('Video: canplay event'));
                    video.addEventListener('canplaythrough', () => console.log('Video: canplaythrough event'));
                    video.addEventListener('play', () => console.log('Video: play event'));
                    video.addEventListener('pause', () => console.log('Video: pause event'));
                    video.addEventListener('seeking', () => console.log('Video: seeking event'));
                    video.addEventListener('seeked', () => console.log('Video: seeked event'));
                    video.addEventListener('waiting', () => console.log('Video: waiting event'));
                    video.addEventListener('playing', () => console.log('Video: playing event'));
                    video.addEventListener('timeupdate', () => console.log('Video: timeupdate event, currentTime:', video.currentTime));
                    video.addEventListener('ended', () => console.log('Video: ended event'));
                    
                    // Handle video errors
                    video.addEventListener('error', (e) => {
                        console.error('Video error event:', video.error ? {
                            code: video.error.code,
                            message: video.error.message
                        } : 'Unknown error');
                        
                        let errorMessage = 'Unknown error';
                        if (video.error) {
                            switch(video.error.code) {
                                case 1: errorMessage = 'MEDIA_ERR_ABORTED: Fetching process aborted by user'; break;
                                case 2: errorMessage = 'MEDIA_ERR_NETWORK: Network error while loading'; break;
                                case 3: errorMessage = 'MEDIA_ERR_DECODE: Error decoding the video'; break;
                                case 4: errorMessage = 'MEDIA_ERR_SRC_NOT_SUPPORTED: Video format not supported'; break;
                                default: errorMessage = \`Unknown error code \${video.error.code}\`;
                            }
                        }
                        console.error('Error details:', errorMessage);
                    });
                    
                    // Utility functions
                    function loadSampleVideo() {
                        video.src = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
                        video.load();
                        console.log('Loaded sample video');
                    }
                    
                    // Network test
                    async function testVideoFetch() {
                        try {
                            console.log('Testing fetch for video URL:', '${movie.videoUrl}');
                            const response = await fetch('${movie.videoUrl}', { method: 'HEAD' });
                            console.log('Fetch response:', response.status, response.statusText);
                            
                            if (response.headers) {
                                const headers = {};
                                response.headers.forEach((value, key) => {
                                    headers[key] = value;
                                });
                                console.log('Response headers:', headers);
                            }
                        } catch (error) {
                            console.error('Fetch test failed:', error.message);
                        }
                    }
                    
                    // Run initial tests
                    console.log('Page loaded, running tests...');
                    testVideoFetch();
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Error in blank-debug route:', error);
        res.status(500).send(`
            <html>
            <body style="background: #000; color: #fff; font-family: Arial, sans-serif; padding: 20px;">
                <h1>Error</h1>
                <pre>${error.stack || error.message}</pre>
            </body>
            </html>
        `);
    }
});

// Simple test route for blank screen debugging
router.get('/test-blank', isAdmin, (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Simple Test Page</title>
            <style>
                body { background: #000; color: #fff; font-family: Arial, sans-serif; padding: 20px; }
            </style>
        </head>
        <body>
            <h1>Test Page</h1>
            <p>If you can see this, basic rendering is working.</p>
            <p>Current time: ${new Date().toLocaleString()}</p>
            <p>Try these debug links:</p>
            <ul>
                <li><a href="/admin/movies/67f7fa98971dcc0b772108fa/blank-debug" style="color: yellow;">Debug Passengers (Blank Issue)</a></li>
                <li><a href="/admin/movies/68071be1760419b1061f25a5/blank-debug" style="color: yellow;">Debug Sinners (MKV Movie)</a></li>
                <li><a href="/admin/movies/67f7fa98971dcc0b772108fa/watch?player=native" style="color: yellow;">Native Player - Passengers</a></li>
                <li><a href="/admin/movies/67f7fa98971dcc0b772108fa/watch?player=direct" style="color: yellow;">Direct Player - Passengers</a></li>
            </ul>
        </body>
        </html>
    `);
});

module.exports = router;
