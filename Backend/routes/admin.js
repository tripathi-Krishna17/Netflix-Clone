const express = require('express');
const router = express.Router();
const Content = require('../models/content');
const User = require('../models/User');
const { isAdmin } = require('../middleware/auth');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sftpService = require('../services/sftpService');
const os = require('os');

// Global variable to store upload progress per user
const uploadProgress = {};

// Helper function to get upload progress
router.get('/api/upload-progress/:sessionId', isAdmin, (req, res) => {
    const { sessionId } = req.params;
    if (uploadProgress[sessionId]) {
        res.json(uploadProgress[sessionId]);
    } else {
        res.json({ percent: 0, message: 'No active upload' });
    }
});

// Configure multer for temporary video uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Store in temp-uploads directory temporarily
        cb(null, 'temp-uploads/');
    },
    filename: function (req, file, cb) {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        // Accept video files including MKV
        if (file.mimetype.startsWith('video/') || file.mimetype === 'video/x-matroska') {
            cb(null, true);
        } else {
            cb(new Error('Only video files are allowed!'), false);
        }
    },
    limits: {
        fileSize: 2 * 1024 * 1024 * 1024 // 2GB limit
    }
});

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'File too large',
                details: 'Maximum file size is 2GB. Please upload a smaller file.'
            });
        }
    }
    next(err);
};

// Add new routes for movie search and addition
router.get('/add-movie', isAdmin, (req, res) => {
    res.render('addMovie');
});

// Add new route for TV show addition
router.get('/add-tvshow', isAdmin, (req, res) => {
    res.render('addTVShow');
});

// Add route to check authentication status
router.get('/auth-check', (req, res) => {
    res.json({
        authenticated: !!req.isAuthenticated && req.isAuthenticated(),
        isAdmin: req.user && req.user.isAdmin,
        user: req.user ? {
            id: req.user._id,
            username: req.user.username
        } : null
    });
});

// Test SFTP connection
router.get('/test-sftp', isAdmin, async (req, res) => {
    try {
        console.log('Testing SFTP connection...');
        
        const sftpService = require('../services/sftpService');
        const sftpConfig = require('../config/sftp');
        const path = require('path');
        
        // Connect to SFTP server
        await sftpService.connect();
        console.log('Connected to SFTP server successfully');
        
        // List files in videos directory
        const remoteVideosPath = path.posix.join(sftpConfig.remoteBasePath, sftpConfig.videosPath);
        console.log(`Listing files in ${remoteVideosPath}`);
        
        const files = await sftpService.client.list(remoteVideosPath);
        
        // Get test file URL for direct testing
        let testFileUrl = null;
        if (files.length > 0) {
            testFileUrl = `/remote-videos/${files[0].name}`;
        }
        
        res.json({
            success: true,
            message: 'SFTP connection successful',
            sftpConfig: {
                host: sftpConfig.host,
                port: sftpConfig.port,
                username: sftpConfig.username,
                remoteBasePath: sftpConfig.remoteBasePath,
                videosPath: sftpConfig.videosPath
            },
            files: files.map(f => ({
                name: f.name,
                size: f.size,
                type: f.type,
                url: sftpConfig.getVideoUrl(f.name)
            })),
            testFileUrl,
            testLink: testFileUrl ? `${req.protocol}://${req.get('host')}${testFileUrl}` : null
        });
    } catch (error) {
        console.error('SFTP test error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : null
        });
    }
});

// Test SFTP connection
router.get('/test-sftp-connection', isAdmin, async (req, res) => {
    console.log('Testing SFTP connection...');
    const testFilePath = path.join(os.tmpdir(), 'sftp-test.txt');
    const testContent = `SFTP connection test file created at ${new Date().toISOString()}`;
    const remotePath = 'sftp-test.txt';
    
    try {
        // 1. Create test file
        fs.writeFileSync(testFilePath, testContent);
        
        // 2. Test connection
        await sftpService.connect();
        
        // 3. Get SFTP configuration details to return
        const sftpConfig = require('../config/sftp');
        const configDetails = {
            host: sftpConfig.host,
            port: sftpConfig.port,
            username: sftpConfig.username,
            remoteBasePath: sftpConfig.remoteBasePath,
            videosPath: sftpConfig.videosPath
        };
        
        // 4. Test file upload
        const uploadResult = await sftpService.uploadFile(testFilePath, remotePath);
        
        // 5. Test file existence check
        const fileExists = await sftpService.fileExists(remotePath);
        
        // 6. Test file deletion
        await sftpService.deleteFile(remotePath);
        
        // 7. Clean up local test file
        fs.unlinkSync(testFilePath);
        
        // 8. Disconnect
        await sftpService.disconnect();
        
        return res.json({
            success: true,
            message: 'SFTP connection test completed successfully',
            details: {
                connection: 'Successfully connected to SFTP server',
                upload: 'Successfully uploaded test file',
                fileCheck: `File existence check: ${fileExists ? 'Passed' : 'Failed'}`,
                deletion: 'Successfully deleted test file',
                config: configDetails
            }
        });
    } catch (error) {
        console.error('SFTP connection test failed:', error);
        
        // Clean up if test file exists
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }
        
        // Try to disconnect if needed
        try {
            await sftpService.disconnect();
        } catch (disconnectError) {
            console.error('Error during disconnect:', disconnectError);
        }
        
        return res.status(500).json({
            success: false,
            message: 'SFTP connection test failed',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// API endpoint for movie search
router.get('/api/movies/search', isAdmin, async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        const TMDB_API_KEY = process.env.TMDB_API_KEY;
        if (!TMDB_API_KEY) {
            console.error('TMDB API key is not configured');
            return res.status(500).json({ error: 'TMDB API key is not configured' });
        }

        console.log('Searching movies on TMDB for query:', q);
        console.log('Using TMDB API key:', TMDB_API_KEY.substring(0, 5) + '...');
        
        try {
        const response = await axios.get('https://api.themoviedb.org/3/search/movie', {
            params: {
                api_key: TMDB_API_KEY,
                query: q,
                include_adult: false,
                language: 'en-US',
                page: 1
            },
            headers: {
                'Accept': 'application/json'
                },
                timeout: 10000 // 10 second timeout
        });
        
            console.log('TMDB Search Response status:', response.status);
        
        if (!response.data || !response.data.results) {
            console.error('Invalid response from TMDB API:', response.data);
            return res.status(500).json({ error: 'Invalid response from TMDB API' });
        }

        const movies = response.data.results.map(movie => ({
            id: movie.id,
            title: movie.title,
            overview: movie.overview,
            posterPath: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
            backdropPath: movie.backdrop_path ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}` : null,
            releaseDate: movie.release_date,
            ratings: movie.vote_average,
            popularity: movie.popularity
        }));
        
        console.log(`Successfully processed ${movies.length} search results`);
            return res.json(movies);
        } catch (axiosError) {
            console.error('Axios error searching movies:', {
                message: axiosError.message,
                code: axiosError.code,
                status: axiosError.response?.status,
                data: axiosError.response?.data
            });
            
            if (axiosError.code === 'ECONNABORTED') {
                return res.status(504).json({ 
                    error: 'TMDB API request timed out',
                    details: 'The request to the movie database timed out. Please try again.'
                });
            }
            
            if (axiosError.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                return res.status(axiosError.response.status || 500).json({
                    error: 'TMDB API error',
                    details: axiosError.response.data?.status_message || axiosError.message
                });
            } else {
                // Network error or request not completed
                return res.status(503).json({
                    error: 'Network Error',
                    details: 'Could not connect to the movie database. Please check your internet connection.'
                });
            }
        }
    } catch (error) {
        console.error('Error searching movies:', {
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({ 
            error: 'Error searching movies',
            details: 'An unexpected error occurred while searching for movies.'
        });
    }
});

// API endpoint for TV show search
router.get('/api/tvshows/search', isAdmin, async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        const TMDB_API_KEY = process.env.TMDB_API_KEY;
        if (!TMDB_API_KEY) {
            console.error('TMDB API key is not configured');
            return res.status(500).json({ error: 'TMDB API key is not configured' });
        }

        console.log('Searching TV shows on TMDB for query:', q);
        console.log('Using TMDB API key:', TMDB_API_KEY.substring(0, 5) + '...');
        
        try {
        const response = await axios.get('https://api.themoviedb.org/3/search/tv', {
            params: {
                api_key: TMDB_API_KEY,
                query: q,
                include_adult: false,
                language: 'en-US',
                page: 1
            },
            headers: {
                'Accept': 'application/json'
                },
                timeout: 10000 // 10 second timeout
        });
        
            console.log('TMDB Search Response status:', response.status);
        
        if (!response.data || !response.data.results) {
            console.error('Invalid response from TMDB API:', response.data);
            return res.status(500).json({ error: 'Invalid response from TMDB API' });
        }

        const tvshows = response.data.results.map(show => ({
            id: show.id,
                title: show.name, // Use title for consistency with movies
            name: show.name,
            overview: show.overview,
            posterPath: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : null,
            backdropPath: show.backdrop_path ? `https://image.tmdb.org/t/p/original${show.backdrop_path}` : null,
                releaseDate: show.first_air_date, // Use releaseDate for consistency with movies
            firstAirDate: show.first_air_date,
            ratings: show.vote_average,
            popularity: show.popularity
        }));
        
        console.log(`Successfully processed ${tvshows.length} search results`);
            return res.json(tvshows);
        } catch (axiosError) {
            console.error('Axios error searching TV shows:', {
                message: axiosError.message,
                code: axiosError.code,
                status: axiosError.response?.status,
                data: axiosError.response?.data
            });
            
            if (axiosError.code === 'ECONNABORTED') {
                return res.status(504).json({ 
                    error: 'TMDB API request timed out',
                    details: 'The request to the TV show database timed out. Please try again.'
                });
            }
            
            if (axiosError.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                return res.status(axiosError.response.status || 500).json({
                    error: 'TMDB API error',
                    details: axiosError.response.data?.status_message || axiosError.message
                });
            } else {
                // Network error or request not completed
                return res.status(503).json({
                    error: 'Network Error',
                    details: 'Could not connect to the TV show database. Please check your internet connection.'
                });
            }
        }
    } catch (error) {
        console.error('Error searching TV shows:', {
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({ 
            error: 'Error searching TV shows',
            details: 'An unexpected error occurred while searching for TV shows.'
        });
    }
});

// API endpoint for adding a movie
router.post('/api/movies/add', isAdmin, upload.single('video'), handleMulterError, async (req, res) => {
    // Generate a unique session ID for this upload
    const sessionId = req.body.sessionId || `upload-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    
    console.log('Admin check passed, received request to add movie:', {
        sessionId,
        isAuth: !!req.isAuthenticated,
        isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : 'not available',
        user: req.user ? {
            id: req.user._id,
            isAdmin: req.user.isAdmin
        } : 'no user',
        body: Object.keys(req.body),
        contentType: req.headers['content-type'],
        hasFile: !!req.file
    });

    // Special handling for JSON requests (no file upload)
    if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
        console.log('Handling JSON request - simplified add without video');
        try {
            if (!req.user || !req.user._id) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required',
                    details: 'Please log in to add movies'
                });
            }

            const { movieId, isFree } = req.body;
            if (!movieId) {
                return res.status(400).json({ 
                    success: false,
                    error: 'Movie ID is required'
                });
            }

            const TMDB_API_KEY = process.env.TMDB_API_KEY;
            if (!TMDB_API_KEY) {
                return res.status(500).json({ 
                    success: false,
                    error: 'TMDB API key is not configured'
                });
            }

            // Check if content already exists
            const existingContent = await Content.findOne({ tmdbId: movieId });
            if (existingContent) {
                return res.status(400).json({ 
                    success: false,
                    error: 'This content is already in the library'
                });
            }

            // Fetch movie details from TMDB
            const response = await axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
                params: {
                    api_key: TMDB_API_KEY,
                    append_to_response: 'credits,production_companies',
                    language: 'en-US'
                }
            });

            const movieData = response.data;
            
            // Create content object
            const content = new Content({
                tmdbId: movieData.id,
                title: movieData.title,
                type: 'movie',
                overview: movieData.overview,
                posterPath: movieData.poster_path ? `https://image.tmdb.org/t/p/w500${movieData.poster_path}` : null,
                backdropPath: movieData.backdrop_path ? `https://image.tmdb.org/t/p/original${movieData.backdrop_path}` : null,
                videoUrl: null,
                releaseDate: movieData.release_date,
                runtime: movieData.runtime,
                ratings: movieData.vote_average,
                genres: movieData.genres.map(g => g.name),
                cast: movieData.credits.cast.slice(0, 5).map(actor => ({
                    id: actor.id,
                    name: actor.name,
                    character: actor.character,
                    profilePath: actor.profile_path ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` : null
                })),
                productionCompanies: movieData.production_companies.map(company => ({
                    id: company.id,
                    name: company.name,
                    logoPath: company.logo_path ? `https://image.tmdb.org/t/p/w92${company.logo_path}` : null
                })),
                isFree: isFree === 'true' || isFree === true,
                addedBy: req.user._id,
                status: 'active'
            });

            await content.save();
            
            console.log('Movie added successfully without video:', content.title);
            
            return res.json({ 
                success: true, 
                message: 'Movie added successfully (without video)',
                content: {
                    id: content._id,
                    title: content.title,
                    type: content.type
                }
            });
        } catch (error) {
            console.error('Error in simplified add movie:', error);
            return res.status(500).json({ 
                success: false,
                error: 'Error adding movie',
                details: error.message
            });
        }
    }
    
    // Initialize progress for this session
    uploadProgress[sessionId] = {
        percent: 0,
        message: 'Preparing upload...',
        fileName: req.file ? req.file.originalname : 'No file',
        timeStamp: Date.now()
    };
    
    try {
        console.log('Received request to add movie:', {
            movieId: req.body.movieId,
            isFree: req.body.isFree,
            hasVideo: !!req.file,
            body: req.body,
            file: req.file ? {
                fileName: req.file.originalname,
                fileSize: req.file.size,
                filePath: req.file.path
            } : null,
            sessionId
        });

        // Validate user
        if (!req.user || !req.user._id) {
            console.error('User not authenticated');
            uploadProgress[sessionId] = { percent: 0, message: 'Authentication failed', error: true };
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
                details: 'Please log in to add movies',
                sessionId
            });
        }

        const { movieId, isFree } = req.body;
        if (!movieId) {
            console.error('Movie ID is missing');
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            uploadProgress[sessionId] = { percent: 0, message: 'Movie ID missing', error: true };
            return res.status(400).json({ 
                success: false,
                error: 'Movie ID is required',
                details: 'Please select a movie from the search results',
                sessionId
            });
        }

        const TMDB_API_KEY = process.env.TMDB_API_KEY;
        if (!TMDB_API_KEY) {
            console.error('TMDB API key is not configured');
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            uploadProgress[sessionId] = { percent: 0, message: 'TMDB API key missing', error: true };
            return res.status(500).json({ 
                success: false,
                error: 'TMDB API key is not configured',
                details: 'Please check your environment variables',
                sessionId
            });
        }

        // Check if content already exists
        const existingContent = await Content.findOne({ tmdbId: movieId });
        if (existingContent) {
            console.error('Content already exists:', movieId);
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            uploadProgress[sessionId] = { percent: 0, message: 'Movie already exists', error: true };
            return res.status(400).json({ 
                success: false,
                error: 'This content is already in the library',
                details: 'Please try adding a different movie',
                sessionId
            });
        }

        // Update progress - fetching movie details
        uploadProgress[sessionId] = { 
            percent: req.file ? 5 : 50, 
            message: 'Fetching movie details...',
            fileName: req.file ? req.file.originalname : 'No file',
            timeStamp: Date.now()
        };

        console.log('Fetching movie details from TMDB for ID:', movieId);
        // Fetch movie details from TMDB
        const response = await axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
            params: {
                api_key: TMDB_API_KEY,
                append_to_response: 'credits,production_companies',
                language: 'en-US'
            }
        });

        if (!response.data) {
            console.error('No data received from TMDB API');
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            uploadProgress[sessionId] = { percent: 0, message: 'Failed to fetch movie details', error: true };
            return res.status(500).json({ 
                success: false,
                error: 'Failed to fetch movie details from TMDB',
                details: 'Please try again later',
                sessionId
            });
        }

        const movieData = response.data;
        console.log('Successfully fetched movie details:', movieData.title);
        
        // Update progress - preparing for upload
        uploadProgress[sessionId] = { 
            percent: req.file ? 10 : 80, 
            message: req.file ? 'Preparing to upload video file...' : 'Preparing to save movie...',
            fileName: req.file ? req.file.originalname : 'No file',
            timeStamp: Date.now()
        };

        // Upload video to SFTP server if provided
        let videoUrl = null;
        if (req.file) {
            try {
                console.log('Uploading video to remote server...');
                console.log(`Original file: ${req.file.originalname}`);
                console.log(`Temp file path: ${req.file.path}`);
                console.log(`Uploaded filename: ${req.file.filename}`);
                
                // Try 3 times to upload the file
                let uploadSuccess = false;
                let retryCount = 0;
                const maxRetries = 3;
                
                while (!uploadSuccess && retryCount < maxRetries) {
                    try {
                        retryCount++;
                        console.log(`SFTP upload attempt ${retryCount}...`);
                        
                        // Track progress during upload
                        const progressHandler = (progress) => {
                            uploadProgress[sessionId] = {
                                ...progress,
                                message: `Uploading video: ${progress.percent}%`,
                                timeStamp: Date.now()
                            };
                            console.log(`Upload progress for ${sessionId}: ${progress.percent}%`);
                        };
                        
                        const uploadResult = await sftpService.uploadFile(
                            req.file.path,
                            req.file.filename,
                            progressHandler
                        );
                        
                        if (uploadResult.success) {
                            videoUrl = uploadResult.videoUrl;
                            console.log('Video uploaded successfully. URL path:', videoUrl);
                            uploadSuccess = true;
                            
                            // Verify that the file exists on the remote server
                            try {
                                const fileExists = await sftpService.fileExists(req.file.filename);
                                console.log(`Verification - File exists on remote server: ${fileExists}`);
                                
                                if (!fileExists) {
                                    console.warn('Warning: File uploaded but not found on verification check');
                                }
                            } catch (verifyError) {
                                console.error('Error verifying file existence:', verifyError);
                            }
                            
                            // Update progress - upload complete
                            uploadProgress[sessionId] = { 
                                percent: 90, 
                                message: 'Video upload complete. Saving movie details...',
                                fileName: req.file.originalname,
                                timeStamp: Date.now()
                            };
                            
                            // Delete the temporary file
                            fs.unlinkSync(req.file.path);
                            console.log('Temporary file deleted:', req.file.path);
                        }
                    } catch (retryError) {
                        console.error(`SFTP upload retry ${retryCount} failed:`, retryError);
                        
                        // Update progress with retry information
                        uploadProgress[sessionId] = { 
                            percent: 10 + (retryCount * 5), 
                            message: `Upload attempt ${retryCount} failed. ${retryCount < maxRetries ? 'Retrying...' : 'Giving up.'}`,
                            error: retryCount >= maxRetries,
                            timeStamp: Date.now()
                        };
                        
                        if (retryCount < maxRetries) {
                            console.log(`Waiting before retry ${retryCount + 1}...`);
                            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay between retries
                        }
                    }
                }
                
                if (!uploadSuccess) {
                    throw new Error('Maximum upload retry attempts reached');
                }
            } catch (uploadError) {
                console.error('Error uploading to SFTP server after all retries:', uploadError);
                
                // If we can't upload to SFTP, we'll still add the movie without the video URL
                console.log('Will proceed to add movie without video due to SFTP error');
                
                // Clean up the temporary file
                if (req.file) {
                    try {
                        fs.unlinkSync(req.file.path);
                        console.log('Cleaned up temporary file after failed upload:', req.file.path);
                    } catch (unlinkError) {
                        console.error('Error deleting temporary file:', unlinkError);
                    }
                }
                
                uploadProgress[sessionId] = { 
                    percent: 50, 
                    message: 'SFTP upload failed but continuing to add movie without video...',
                    timeStamp: Date.now()
                };
                
                // Set videoUrl to null and continue with adding the movie
                videoUrl = null;
                
                // Don't return the error response - continue with adding the movie
                // The movie will be added without a video file
            }
        }

        // Update progress - saving to database
        uploadProgress[sessionId] = { 
            percent: 95, 
            message: 'Saving movie to database...',
            timeStamp: Date.now()
        };

        // Create content object
        const content = new Content({
            tmdbId: movieData.id,
            title: movieData.title,
            type: 'movie',
            overview: movieData.overview,
            posterPath: movieData.poster_path ? `https://image.tmdb.org/t/p/w500${movieData.poster_path}` : null,
            backdropPath: movieData.backdrop_path ? `https://image.tmdb.org/t/p/original${movieData.backdrop_path}` : null,
            videoUrl: videoUrl,
            releaseDate: movieData.release_date,
            runtime: movieData.runtime,
            ratings: movieData.vote_average,
            genres: movieData.genres.map(g => g.name),
            cast: movieData.credits.cast.slice(0, 5).map(actor => ({
                id: actor.id,
                name: actor.name,
                character: actor.character,
                profilePath: actor.profile_path ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` : null
            })),
            productionCompanies: movieData.production_companies.map(company => ({
                id: company.id,
                name: company.name,
                logoPath: company.logo_path ? `https://image.tmdb.org/t/p/w92${company.logo_path}` : null
            })),
            isFree: isFree === 'true',
            addedBy: req.user._id,
            status: 'active'
        });

        console.log('Saving content to database...');
        await content.save();
        console.log('Successfully saved content to database');

        // Update progress - completed successfully
        uploadProgress[sessionId] = { 
            percent: 100, 
            message: 'Movie added successfully!',
            title: movieData.title,
            complete: true,
            timeStamp: Date.now()
        };
        
        // Schedule cleanup of progress data after 5 minutes
        setTimeout(() => {
            if (uploadProgress[sessionId]) {
                delete uploadProgress[sessionId];
                console.log(`Cleaned up progress data for session ${sessionId}`);
            }
        }, 5 * 60 * 1000);

        res.json({ 
            success: true, 
            message: 'Movie added successfully',
            content: {
                id: content._id,
                title: content.title,
                type: content.type
            },
            sessionId
        });
    } catch (error) {
        console.error('Error adding movie:', {
            message: error.message,
            stack: error.stack,
            response: error.response?.data,
            name: error.name,
            code: error.code,
            path: error.path,
            keyValue: error.keyValue
        });

        // If there was an error and a file was uploaded, delete it
        if (req.file) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkError) {
                console.error('Error deleting uploaded file:', unlinkError);
            }
        }

        // Update progress with error
        uploadProgress[sessionId] = { 
            percent: 0, 
            message: 'Error: ' + error.message,
            error: true,
            timeStamp: Date.now()
        };

        // Check for specific error types
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                error: 'Validation Error',
                details: Object.values(error.errors).map(err => err.message),
                sessionId
            });
        }

        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                error: 'Duplicate Error',
                details: 'This content already exists in the database',
                sessionId
            });
        }

        res.status(500).json({ 
            success: false,
            error: 'Error adding movie',
            details: error.message,
            code: error.code,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            sessionId
        });
    }
});

// API endpoint for adding a TV show
router.post('/api/tvshows/add', isAdmin, upload.single('video'), handleMulterError, async (req, res) => {
    // Generate a unique session ID for this upload
    const sessionId = req.body.sessionId || `upload-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    
    console.log('Admin check passed, received request to add TV show:', {
        sessionId,
        isAuth: !!req.isAuthenticated,
        isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : 'not available',
        user: req.user ? {
            id: req.user._id,
            isAdmin: req.user.isAdmin
        } : 'no user',
        body: Object.keys(req.body),
        contentType: req.headers['content-type'],
        hasFile: !!req.file
    });

    // Special handling for JSON requests (no file upload)
    if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
        console.log('Handling JSON request - simplified add without video');
        try {
            if (!req.user || !req.user._id) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required',
                    details: 'Please log in to add TV shows'
                });
            }

            const { showId, isFree } = req.body;
        if (!showId) {
                return res.status(400).json({ 
                    success: false,
                    error: 'TV Show ID is required'
                });
            }

            const TMDB_API_KEY = process.env.TMDB_API_KEY;
            if (!TMDB_API_KEY) {
                return res.status(500).json({ 
                    success: false,
                    error: 'TMDB API key is not configured'
                });
            }

            // Check if content already exists
            const existingContent = await Content.findOne({ tmdbId: showId });
            if (existingContent) {
                return res.status(400).json({ 
                    success: false,
                    error: 'This content is already in the library'
                });
            }

            // Fetch TV show details from TMDB
            const response = await axios.get(`https://api.themoviedb.org/3/tv/${showId}`, {
                params: {
                    api_key: TMDB_API_KEY,
                    append_to_response: 'credits,production_companies',
                    language: 'en-US'
                }
            });

            const showData = response.data;
            
            // Create content object
            const content = new Content({
                tmdbId: showData.id,
                title: showData.name,
                type: 'tvshow',
                overview: showData.overview,
                posterPath: showData.poster_path ? `https://image.tmdb.org/t/p/w500${showData.poster_path}` : null,
                backdropPath: showData.backdrop_path ? `https://image.tmdb.org/t/p/original${showData.backdrop_path}` : null,
                videoUrl: null,
                releaseDate: showData.first_air_date,
                numberOfSeasons: showData.number_of_seasons,
                numberOfEpisodes: showData.number_of_episodes,
                ratings: showData.vote_average,
                genres: showData.genres.map(g => g.name),
                cast: showData.credits.cast.slice(0, 5).map(actor => ({
                    id: actor.id,
                    name: actor.name,
                    character: actor.character,
                    profilePath: actor.profile_path ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` : null
                })),
                productionCompanies: showData.production_companies.map(company => ({
                    id: company.id,
                    name: company.name,
                    logoPath: company.logo_path ? `https://image.tmdb.org/t/p/w92${company.logo_path}` : null
                })),
                isFree: isFree === 'true' || isFree === true,
                addedBy: req.user._id,
                status: 'active'
            });

            await content.save();
            
            console.log('TV Show added successfully without video:', content.title);
            
            return res.json({ 
                success: true, 
                message: 'TV Show added successfully (without video)',
                content: {
                    id: content._id,
                    title: content.title,
                    type: content.type
                }
            });
        } catch (error) {
            console.error('Error in simplified add TV show:', error);
            return res.status(500).json({ 
                success: false,
                error: 'Error adding TV show',
                details: error.message
            });
        }
    }
    
    // Initialize progress for this session
    uploadProgress[sessionId] = {
        percent: 0,
        message: 'Preparing upload...',
        fileName: req.file ? req.file.originalname : 'No file',
        timeStamp: Date.now()
    };
    
    try {
        console.log('Received request to add TV show:', {
            showId: req.body.showId,
            isFree: req.body.isFree,
            hasVideo: !!req.file,
            body: req.body,
            file: req.file ? {
                fileName: req.file.originalname,
                fileSize: req.file.size,
                filePath: req.file.path
            } : null,
            sessionId
        });

        // Validate user
        if (!req.user || !req.user._id) {
            console.error('User not authenticated');
            uploadProgress[sessionId] = { percent: 0, message: 'Authentication failed', error: true };
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
                details: 'Please log in to add TV shows',
                sessionId
            });
        }

        const { showId, isFree } = req.body;
        if (!showId) {
            console.error('TV Show ID is missing');
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            uploadProgress[sessionId] = { percent: 0, message: 'TV Show ID missing', error: true };
            return res.status(400).json({ 
                success: false,
                error: 'TV Show ID is required',
                details: 'Please select a TV show from the search results',
                sessionId
            });
        }

        const TMDB_API_KEY = process.env.TMDB_API_KEY;
        if (!TMDB_API_KEY) {
            console.error('TMDB API key is not configured');
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            uploadProgress[sessionId] = { percent: 0, message: 'TMDB API key missing', error: true };
            return res.status(500).json({ 
                success: false,
                error: 'TMDB API key is not configured',
                details: 'Please check your environment variables',
                sessionId
            });
        }

        // Check if content already exists
        const existingContent = await Content.findOne({ tmdbId: showId });
        if (existingContent) {
            console.error('Content already exists:', showId);
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            uploadProgress[sessionId] = { percent: 0, message: 'TV Show already exists', error: true };
            return res.status(400).json({ 
                success: false,
                error: 'This content is already in the library',
                details: 'Please try adding a different TV show',
                sessionId
            });
        }

        // Fetch TV show details from TMDB
        uploadProgress[sessionId] = { percent: 10, message: 'Fetching TV show details...', timeStamp: Date.now() };
        
        const response = await axios.get(`https://api.themoviedb.org/3/tv/${showId}`, {
            params: {
                api_key: TMDB_API_KEY,
                append_to_response: 'credits,production_companies',
                language: 'en-US'
            }
        });

        const showData = response.data;
        uploadProgress[sessionId] = { percent: 20, message: 'Processing TV show details...', timeStamp: Date.now() };

        // Define variables for file handling
        let videoUrl = null;
        let fileInfo = null;

        // Handle file upload if a file was provided
        if (req.file) {
            const localFilePath = req.file.path;
            const fileExtension = path.extname(req.file.originalname).toLowerCase();
            const safeFileName = `tvshow_${showId}_${Date.now()}${fileExtension}`;
            
            uploadProgress[sessionId] = { percent: 30, message: 'Uploading video file to server...', timeStamp: Date.now() };
            
            console.log(`Uploading file to SFTP server: ${safeFileName}`);
            
            try {
                const progressHandler = (progress) => {
                    // Calculate overall progress (30% for TMDB + 60% for upload)
                    const overallPercent = 30 + Math.floor(progress.percent * 0.6);
                    uploadProgress[sessionId] = {
                        percent: overallPercent,
                        message: `Uploading video file: ${progress.percent}%`,
                        uploaded: progress.uploaded,
                        total: progress.total,
                        timeStamp: Date.now()
                    };
                };
                
                // Upload to SFTP server
                fileInfo = await sftpService.uploadFile(localFilePath, safeFileName, progressHandler);
                videoUrl = fileInfo.videoUrl;
                
                uploadProgress[sessionId] = { 
                    percent: 90, 
                    message: 'Video uploaded, saving content information...', 
                    timeStamp: Date.now() 
                };
                
                console.log(`File upload successful: ${videoUrl}`);
            } catch (uploadError) {
                console.error('Error uploading file:', uploadError);
                
                uploadProgress[sessionId] = { 
                    percent: 0, 
                    message: `File upload failed: ${uploadError.message}`, 
                    error: true,
                    timeStamp: Date.now() 
                };
                
                return res.status(500).json({ 
                    success: false,
                    error: 'Video upload failed',
                    details: uploadError.message,
                    sessionId
                });
            } finally {
                // Clean up temporary file
                try {
                    fs.unlinkSync(localFilePath);
                    console.log(`Temporary file deleted: ${localFilePath}`);
                } catch (unlinkError) {
                    console.error(`Failed to delete temporary file: ${unlinkError.message}`);
                }
            }
        }

        // Create content object
        const content = new Content({
            tmdbId: showData.id,
            title: showData.name,
            type: 'tvshow',
            overview: showData.overview,
            posterPath: showData.poster_path ? `https://image.tmdb.org/t/p/w500${showData.poster_path}` : null,
            backdropPath: showData.backdrop_path ? `https://image.tmdb.org/t/p/original${showData.backdrop_path}` : null,
            videoUrl: videoUrl,
            releaseDate: showData.first_air_date,
            numberOfSeasons: showData.number_of_seasons,
            numberOfEpisodes: showData.number_of_episodes,
            ratings: showData.vote_average,
            genres: showData.genres.map(g => g.name),
            cast: showData.credits.cast.slice(0, 5).map(actor => ({
                id: actor.id,
                name: actor.name,
                character: actor.character,
                profilePath: actor.profile_path ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` : null
            })),
            productionCompanies: showData.production_companies.map(company => ({
                id: company.id,
                name: company.name,
                logoPath: company.logo_path ? `https://image.tmdb.org/t/p/w92${company.logo_path}` : null
            })),
            isFree: isFree === 'true' || isFree === true,
            addedBy: req.user._id,
            status: 'active'
        });

        await content.save();
        uploadProgress[sessionId] = { percent: 100, message: 'Complete!', timeStamp: Date.now() };
        
        console.log('TV Show added successfully:', {
            id: content._id,
            title: content.title,
            videoUrl: content.videoUrl
        });
        
        res.json({ 
            success: true, 
            message: 'TV Show added successfully',
            content: {
                id: content._id,
                title: content.title,
                type: content.type,
                videoUrl: content.videoUrl
            },
            sessionId
        });
    } catch (error) {
        console.error('Error adding TV show:', error);
        uploadProgress[sessionId] = { 
            percent: 0, 
            message: `Error: ${error.message}`, 
            error: true,
            timeStamp: Date.now() 
        };
        
        // Clean up file if exists
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkError) {
                console.error('Error deleting temporary file:', unlinkError);
            }
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Error adding TV show', 
            details: error.message,
            sessionId
        });
    }
});

// Get all content (movies and TV shows)
router.get('/api/content', isAdmin, async (req, res) => {
    try {
        const { type, status, featured, trending, search, isFree } = req.query;
        const query = {};

        if (type) query.type = type;
        if (status) query.status = status;
        if (featured) query.featured = featured === 'true';
        if (trending) query.trending = trending === 'true';
        if (isFree) query.isFree = isFree === 'true';
        if (search) {
            query.$text = { $search: search };
        }

        const content = await Content.find(query)
            .sort({ createdAt: -1 })
            .populate('addedBy', 'username');

        res.json({ success: true, content });
    } catch (error) {
        console.error('Error fetching content:', error);
        res.status(500).json({ error: 'Error fetching content', details: error.message });
    }
});

// Get single content by ID
router.get('/api/content/:id', isAdmin, async (req, res) => {
    try {
        const content = await Content.findById(req.params.id)
            .populate('addedBy', 'username');

        if (!content) {
            return res.status(404).json({ error: 'Content not found' });
        }

        res.json({ success: true, content });
    } catch (error) {
        console.error('Error fetching content:', error);
        res.status(500).json({ error: 'Error fetching content', details: error.message });
    }
});

// Update content status (active/inactive)
router.patch('/api/content/:id/status', isAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }

        const content = await Content.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );

        if (!content) {
            return res.status(404).json({ error: 'Content not found' });
        }

        res.json({ success: true, content });
    } catch (error) {
        console.error('Error updating content status:', error);
        res.status(500).json({ error: 'Error updating content status', details: error.message });
    }
});

// Toggle featured status
router.patch('/api/content/:id/featured', isAdmin, async (req, res) => {
    try {
        const content = await Content.findById(req.params.id);
        if (!content) {
            return res.status(404).json({ error: 'Content not found' });
        }

        content.featured = !content.featured;
        await content.save();

        res.json({ success: true, content });
    } catch (error) {
        console.error('Error toggling featured status:', error);
        res.status(500).json({ error: 'Error toggling featured status', details: error.message });
    }
});

// Toggle trending status
router.patch('/api/content/:id/trending', isAdmin, async (req, res) => {
    try {
        const content = await Content.findById(req.params.id);
        if (!content) {
            return res.status(404).json({ error: 'Content not found' });
        }

        content.trending = !content.trending;
        await content.save();

        res.json({ success: true, content });
    } catch (error) {
        console.error('Error toggling trending status:', error);
        res.status(500).json({ error: 'Error toggling trending status', details: error.message });
    }
});

// Toggle free status
router.patch('/api/content/:id/free', isAdmin, async (req, res) => {
    try {
        const content = await Content.findById(req.params.id);
        if (!content) {
            return res.status(404).json({ error: 'Content not found' });
        }

        content.isFree = !content.isFree;
        await content.save();

        res.json({ success: true, content });
    } catch (error) {
        console.error('Error toggling free status:', error);
        res.status(500).json({ error: 'Error toggling free status', details: error.message });
    }
});

// Delete content
router.delete('/api/content/:id', isAdmin, async (req, res) => {
    try {
        const content = await Content.findByIdAndDelete(req.params.id);
        if (!content) {
            return res.status(404).json({ error: 'Content not found' });
        }

        res.json({ success: true, message: 'Content deleted successfully' });
    } catch (error) {
        console.error('Error deleting content:', error);
        res.status(500).json({ error: 'Error deleting content', details: error.message });
    }
});

// Get all movies
router.get('/movies', isAdmin, async (req, res) => {
    try {
        const movies = await Movie.find().sort({ createdAt: -1 });
        res.json({ success: true, movies });
    } catch (error) {
        console.error('Error fetching movies:', error);
        res.status(500).json({ success: false, error: 'Error fetching movies' });
    }
});

// Get single movie by ID
router.get('/movies/:id', isAdmin, async (req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        if (!movie) {
            return res.status(404).json({ success: false, error: 'Movie not found' });
        }
        res.json({ success: true, movie });
    } catch (error) {
        console.error('Error fetching movie:', error);
        res.status(500).json({ success: false, error: 'Error fetching movie' });
    }
});

// Fetch latest movies
router.get('/api/movies/fetch-latest', isAdmin, async (req, res) => {
    try {
        const TMDB_API_KEY = '6ec9180bfc843aba1677d9ff1b531116';
        console.log('Fetching latest movies from TMDB...');
        
        const response = await axios.get('https://api.themoviedb.org/3/movie/now_playing', {
            params: {
                api_key: TMDB_API_KEY,
                language: 'en-US',
                page: 1,
                region: 'US'
            },
            headers: {
                'Accept': 'application/json'
            }
        });
        
        console.log('TMDB API Response:', response.data);
        
        if (!response.data || !response.data.results) {
            console.error('Invalid response from TMDB API:', response.data);
            return res.status(500).json({ error: 'Invalid response from TMDB API' });
        }

        const movies = response.data.results.map(movie => ({
            id: movie.id,
            title: movie.title,
            overview: movie.overview,
            posterPath: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
            backdropPath: movie.backdrop_path ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}` : null,
            releaseDate: movie.release_date,
            ratings: movie.vote_average,
            popularity: movie.popularity
        }));

        console.log(`Successfully processed ${movies.length} latest movies`);
        res.json(movies);
    } catch (error) {
        console.error('Error fetching latest movies:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });
        res.status(500).json({ 
            error: 'Error fetching latest movies',
            details: error.response?.data || error.message
        });
    }
});

// Fetch latest TV shows
router.get('/api/tvshows/fetch-latest', isAdmin, async (req, res) => {
    try {
        const TMDB_API_KEY = process.env.TMDB_API_KEY;
        if (!TMDB_API_KEY) {
            console.error('TMDB API key is not configured');
            return res.status(500).json({ error: 'TMDB API key is not configured' });
        }

        console.log('Fetching latest TV shows from TMDB...');
        
        const response = await axios.get('https://api.themoviedb.org/3/tv/on_the_air', {
            params: {
                api_key: TMDB_API_KEY,
                language: 'en-US',
                page: 1
            },
            headers: {
                'Accept': 'application/json'
            }
        });
        
        console.log('TMDB API Response:', response.data);
        
        if (!response.data || !response.data.results) {
            console.error('Invalid response from TMDB API:', response.data);
            return res.status(500).json({ error: 'Invalid response from TMDB API' });
        }

        const tvshows = response.data.results.map(show => ({
            id: show.id,
            name: show.name,
            overview: show.overview,
            posterPath: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : null,
            backdropPath: show.backdrop_path ? `https://image.tmdb.org/t/p/original${show.backdrop_path}` : null,
            firstAirDate: show.first_air_date,
            ratings: show.vote_average,
            popularity: show.popularity
        }));

        console.log(`Successfully processed ${tvshows.length} latest TV shows`);
        res.json(tvshows);
    } catch (error) {
        console.error('Error fetching latest TV shows:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });
        res.status(500).json({ 
            error: 'Error fetching latest TV shows',
            details: error.response?.data || error.message
        });
    }
});

// Get detailed movie information
router.get('/api/movies/:id/details', isAdmin, async (req, res) => {
    try {
        const TMDB_API_KEY = process.env.TMDB_API_KEY;
        if (!TMDB_API_KEY) {
            console.error('TMDB API key is not configured');
            return res.status(500).json({ error: 'TMDB API key is not configured' });
        }

        const movieId = req.params.id;
        console.log(`Fetching details for movie ID: ${movieId}`);
        console.log('Using TMDB API key:', TMDB_API_KEY.substring(0, 5) + '...');
        
        try {
        // Fetch movie details
        const movieResponse = await axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
            params: {
                api_key: TMDB_API_KEY,
                append_to_response: 'credits,production_companies,videos',
                language: 'en-US'
                },
                timeout: 10000 // 10 second timeout
        });
        
            console.log('TMDB Movie Details Response status:', movieResponse.status);
        
        if (!movieResponse.data) {
            console.error('Invalid response from TMDB API for movie details');
            return res.status(500).json({ error: 'Invalid response from TMDB API' });
        }

        const movie = movieResponse.data;
            
            // Ensure all required properties exist to prevent errors
            if (!movie.credits || !movie.videos) {
                console.error('Missing required properties in movie data:', { 
                    hasCredits: !!movie.credits, 
                    hasVideos: !!movie.videos 
                });
                return res.status(500).json({ 
                    error: 'Incomplete movie data from TMDB API',
                    details: 'The movie information is incomplete. Please try again later.'
                });
            }
            
            // Safely extract data with null checks
        const formattedMovie = {
            id: movie.id,
                title: movie.title || 'Unknown Title',
                overview: movie.overview || 'No overview available',
            posterPath: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
            backdropPath: movie.backdrop_path ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}` : null,
                releaseDate: movie.release_date || 'Unknown',
                runtime: movie.runtime || 0,
                ratings: movie.vote_average || 0,
                genres: (movie.genres || []).map(genre => genre.name),
                cast: (movie.credits?.cast || []).slice(0, 5).map(actor => ({
                id: actor.id,
                    name: actor.name || 'Unknown Actor',
                    character: actor.character || 'Unknown Character',
                profilePath: actor.profile_path ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` : null
            })),
                productionCompanies: (movie.production_companies || []).map(company => ({
                id: company.id,
                    name: company.name || 'Unknown Company',
                logoPath: company.logo_path ? `https://image.tmdb.org/t/p/w92${company.logo_path}` : null
            })),
                videos: (movie.videos?.results || []).map(video => ({
                id: video.id,
                key: video.key,
                    name: video.name || 'Unknown Video',
                    site: video.site || 'Unknown Site',
                    type: video.type || 'Unknown Type',
                    official: video.official || false,
                    publishedAt: video.published_at || null
            }))
        };

        console.log(`Successfully processed details for movie: ${formattedMovie.title}`);
            return res.json(formattedMovie);
            
        } catch (axiosError) {
            console.error('Axios error fetching movie details:', {
                message: axiosError.message,
                code: axiosError.code,
                status: axiosError.response?.status,
                data: axiosError.response?.data
            });
            
            if (axiosError.code === 'ECONNABORTED') {
                return res.status(504).json({ 
                    error: 'TMDB API request timed out',
                    details: 'The request to the movie database timed out. Please try again.'
                });
            }
            
            if (axiosError.response) {
                // Handle specific error codes from TMDB API
                if (axiosError.response.status === 404) {
                    return res.status(404).json({
                        error: 'Movie not found',
                        details: 'The requested movie ID does not exist in the TMDB database.'
                    });
                }
                
                return res.status(axiosError.response.status || 500).json({
                    error: 'TMDB API error',
                    details: axiosError.response.data?.status_message || axiosError.message
                });
            } else {
                // Network error or request not completed
                return res.status(503).json({
                    error: 'Network Error',
                    details: 'Could not connect to the movie database. Please check your internet connection.'
                });
            }
        }
    } catch (error) {
        console.error('Error fetching movie details:', {
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({ 
            error: 'Error fetching movie details',
            details: 'An unexpected error occurred while fetching movie details.'
        });
    }
});

// Get detailed TV show information
router.get('/api/tvshows/:id/details', isAdmin, async (req, res) => {
    try {
        const TMDB_API_KEY = process.env.TMDB_API_KEY;
        if (!TMDB_API_KEY) {
            console.error('TMDB API key is not configured');
            return res.status(500).json({ error: 'TMDB API key is not configured' });
        }

        const showId = req.params.id;
        console.log(`Fetching details for TV show ID: ${showId}`);
        
        const showResponse = await axios.get(`https://api.themoviedb.org/3/tv/${showId}`, {
            params: {
                api_key: TMDB_API_KEY,
                append_to_response: 'credits,production_companies',
                language: 'en-US'
            }
        });
        
        console.log('TMDB TV Show Details Response:', showResponse.data);
        
        if (!showResponse.data) {
            console.error('Invalid response from TMDB API for TV show details');
            return res.status(500).json({ error: 'Invalid response from TMDB API' });
        }

        const show = showResponse.data;
        const formattedShow = {
            id: show.id,
            name: show.name,
            overview: show.overview,
            posterPath: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : null,
            backdropPath: show.backdrop_path ? `https://image.tmdb.org/t/p/original${show.backdrop_path}` : null,
            firstAirDate: show.first_air_date,
            numberOfSeasons: show.number_of_seasons,
            numberOfEpisodes: show.number_of_episodes,
            ratings: show.vote_average,
            genres: show.genres.map(genre => genre.name),
            cast: show.credits.cast.slice(0, 5).map(actor => ({
                id: actor.id,
                name: actor.name,
                character: actor.character,
                profilePath: actor.profile_path ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` : null
            })),
            productionCompanies: show.production_companies.map(company => ({
                id: company.id,
                name: company.name,
                logoPath: company.logo_path ? `https://image.tmdb.org/t/p/w92${company.logo_path}` : null
            }))
        };

        console.log(`Successfully processed details for TV show: ${formattedShow.name}`);
        res.json(formattedShow);
    } catch (error) {
        console.error('Error fetching TV show details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });
        res.status(500).json({ 
            error: 'Error fetching TV show details',
            details: error.response?.data || error.message
        });
    }
});

// Get free content
router.get('/api/content/free', isAdmin, async (req, res) => {
    try {
        const { type } = req.query;
        const query = { isFree: true, status: 'active' };

        if (type) {
            query.type = type;
        }

        const content = await Content.find(query)
            .sort({ createdAt: -1 })
            .populate('addedBy', 'username');

        res.json({ success: true, content });
    } catch (error) {
        console.error('Error fetching free content:', error);
        res.status(500).json({ error: 'Error fetching free content', details: error.message });
    }
});

// Get SFTP server statistics
router.get('/api/sftp/stats', isAdmin, async (req, res) => {
    try {
        const sftpService = require('../services/sftpService');
        const sftpConfig = require('../config/sftp');
        const path = require('path');
        
        // Connect to SFTP server
        await sftpService.connect();
        console.log('Connected to SFTP server for stats');
        
        // List all video files
        const remoteVideosPath = path.posix.join(sftpConfig.remoteBasePath, sftpConfig.videosPath);
        console.log(`Listing files in ${remoteVideosPath}`);
        
        const files = await sftpService.client.list(remoteVideosPath);
        
        // Get total size and count by type
        let totalSize = 0;
        let movieCount = 0;
        let tvShowCount = 0;
        let otherCount = 0;
        
        // Get file stats one by one
        const filesWithDetails = await Promise.all(files.map(async (file) => {
            if (file.type === '-') { // Regular file
                // Extract details if filename follows our naming convention
                let type = 'other';
                if (file.name.startsWith('movie_')) {
                    type = 'movie';
                    movieCount++;
                } else if (file.name.startsWith('tvshow_')) {
                    type = 'tvshow';
                    tvShowCount++;
                } else {
                    otherCount++;
                }
                
                // Get file stats
                const filePath = path.posix.join(remoteVideosPath, file.name);
                const stats = await sftpService.client.stat(filePath);
                totalSize += stats.size;
                
                // Return details
                return {
                    name: file.name,
                    type,
                    size: stats.size,
                    lastModified: stats.mtime
                };
            }
            return null;
        }));
        
        // Filter out null values (directories)
        const fileDetails = filesWithDetails.filter(Boolean);
        
        // Sort by size (largest first)
        fileDetails.sort((a, b) => b.size - a.size);
        
        // Get server information
        const serverInfo = {
            host: sftpConfig.host,
            port: sftpConfig.port,
            username: sftpConfig.username,
            remoteBasePath: sftpConfig.remoteBasePath,
            videosPath: sftpConfig.videosPath,
            isConnected: sftpService.isConnected
        };
        
        // Disconnect after getting stats
        await sftpService.disconnect();
        
        // Return statistics
        res.json({
            success: true,
            stats: {
                totalFiles: files.length,
                totalVideos: movieCount + tvShowCount,
                movieCount,
                tvShowCount,
                otherCount,
                totalSize,
                formattedSize: formatSize(totalSize)
            },
            server: serverInfo,
            recentFiles: fileDetails.slice(0, 10) // Top 10 largest files
        });
    } catch (error) {
        console.error('Error fetching SFTP stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch SFTP statistics',
            details: error.message
        });
    }
});

// Helper function to format size in bytes to human-readable format
function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = router; 