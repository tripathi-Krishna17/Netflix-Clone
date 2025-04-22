const express = require('express');
const router = express.Router();
const sftpService = require('../services/sftpService');
const sftpConfig = require('../fix-sftp');
const { isAuthenticated } = require('../middleware/auth');
const Content = require('../models/content');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create a temporary directory for video cache if it doesn't exist
const tempDir = path.join(os.tmpdir(), 'netflix_video_cache');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Debug endpoint to check SFTP connection and configuration
router.get('/debug', async (req, res) => {
  try {
    console.log('[DEBUG] SFTP debugging endpoint called');
    
    // Check SFTP configuration
    const sftpDetails = {
      host: sftpConfig.host,
      port: sftpConfig.port,
      username: sftpConfig.username,
      passwordProvided: !!sftpConfig.password,
      remoteBasePath: sftpConfig.remoteBasePath,
      videosPath: sftpConfig.videosPath,
    };
    
    // Try to connect to SFTP server
    let connectionStatus = 'Not attempted';
    let filesListed = [];
    let error = null;
    
    try {
      console.log('[DEBUG] Attempting to connect to SFTP server');
      await sftpService.connect();
      connectionStatus = 'Connected successfully';
      
      // Try to list files in videos directory
      const videosDirPath = path.posix.join(sftpConfig.remoteBasePath, sftpConfig.videosPath);
      console.log(`[DEBUG] Listing files in ${videosDirPath}`);
      const files = await sftpService.client.list(videosDirPath);
      
      filesListed = files.map(f => ({
        name: f.name,
        size: f.size,
        isDirectory: f.isDirectory,
        modifyTime: f.modifyTime
      }));
    } catch (e) {
      connectionStatus = 'Connection failed';
      error = {
        message: e.message,
        code: e.code,
        stack: process.env.NODE_ENV === 'development' ? e.stack : null
      };
    }
    
    // Check videos in the database
    const videosInDb = await Content.find({ videoUrl: { $regex: '/remote-videos/' } })
      .select('title videoUrl')
      .limit(10);
    
    res.json({
      success: true,
      sftpConfig: sftpDetails,
      connection: {
        status: connectionStatus,
        error: error
      },
      remoteFiles: filesListed,
      videosInDb: videosInDb
    });
  } catch (error) {
    console.error('[ERROR] SFTP debug endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to debug SFTP',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : null
    });
  }
});

// Add a direct test player that bypasses SFTP and plays from a local file or URL
router.get('/direct-test/:filename', async (req, res) => {
  const filename = req.params.filename;
  const movieId = req.query.id;
  
  // Try to get movie details if ID is provided
  let movie = null;
  if (movieId) {
    try {
      movie = await Content.findById(movieId);
    } catch (err) {
      console.error('Error fetching movie:', err);
    }
  }
  
  // Create a direct video URL that doesn't depend on SFTP
  // This could be a local file, a direct URL, or a YouTube fallback
  const directVideoUrl = `/remote-videos/${filename}`;
  const fallbackVideoUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
  
  console.log(`[DEBUG] Direct test player for: ${filename}, movieId: ${movieId}`);
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Direct Video Test</title>
      <style>
        body { background: #000; color: #fff; font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        h1 { color: #e50914; }
        .video-container { width: 100%; margin-top: 20px; position: relative; padding-top: 56.25%; }
        video { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
        .debug { margin-top: 20px; background: #111; padding: 10px; border-radius: 4px; }
        pre { white-space: pre-wrap; font-size: 12px; }
        button { background: #e50914; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
        button:hover { background: #f40612; }
        .controls { margin-top: 10px; display: flex; gap: 10px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Direct Video Test</h1>
        <p>Testing direct stream of: ${filename}${movie ? ` (${movie.title})` : ''}</p>
        
        <div class="video-container">
          <video id="videoPlayer" controls>
            <source src="${directVideoUrl}" type="video/mp4">
            Your browser does not support the video tag.
          </video>
        </div>
        
        <div class="controls">
          <button onclick="loadFallbackVideo()">Try Fallback Video</button>
          <button onclick="toggleDebugInfo()">Toggle Debug Info</button>
        </div>
        
        <div class="debug" id="debugInfo">
          <h3>Debug Info</h3>
          <pre id="debugText">
Video URL: ${directVideoUrl}
Fallback URL: ${fallbackVideoUrl}
Movie ID: ${movieId || 'Not provided'}
Movie Title: ${movie ? movie.title : 'Unknown'}
Waiting for player events...
          </pre>
        </div>
      </div>
      
      <script>
        const videoElement = document.getElementById('videoPlayer');
        const debugText = document.getElementById('debugText');
        
        function addDebugInfo(message) {
          debugText.textContent += "\\n" + message;
        }
        
        // Load fallback video if the main one fails
        function loadFallbackVideo() {
          addDebugInfo('Loading fallback video...');
          videoElement.src = '${fallbackVideoUrl}';
          videoElement.load();
        }
        
        // Toggle debug info visibility
        function toggleDebugInfo() {
          const debugInfo = document.getElementById('debugInfo');
          debugInfo.style.display = debugInfo.style.display === 'none' ? 'block' : 'none';
        }
        
        // Monitor video events
        videoElement.addEventListener('loadstart', () => {
          addDebugInfo('Event: loadstart - Video is starting to load');
        });
        
        videoElement.addEventListener('loadedmetadata', () => {
          addDebugInfo(\`Event: loadedmetadata - Metadata loaded. Duration: \${videoElement.duration}s\`);
        });
        
        videoElement.addEventListener('canplay', () => {
          addDebugInfo('Event: canplay - Video can start playing');
        });
        
        videoElement.addEventListener('error', (e) => {
          addDebugInfo(\`Event: error - Error code: \${videoElement.error ? videoElement.error.code : 'unknown'}\`);
          addDebugInfo(\`Error message: \${videoElement.error ? videoElement.error.message : 'unknown'}\`);
          // Show an alert and auto-load the fallback video after a short delay
          setTimeout(() => {
            if (confirm('Video failed to load. Load fallback video?')) {
              loadFallbackVideo();
            }
          }, 1000);
        });
        
        videoElement.addEventListener('playing', () => {
          addDebugInfo('Event: playing - Video is playing');
        });
        
        // Try to load the video
        try {
          videoElement.load();
          addDebugInfo('Video load() method called');
        } catch(err) {
          addDebugInfo(\`Error calling load(): \${err.message}\`);
        }
      </script>
    </body>
    </html>
  `);
});

// List all available videos on SFTP server
router.get('/list', async (req, res) => {
  console.log('[DEBUG] List videos endpoint called');
  
  try {
    // List available files in the SFTP server
    await sftpService.connect();
    const videosDirPath = path.posix.join(sftpConfig.remoteBasePath, sftpConfig.videosPath);
    const filesList = await sftpService.client.list(videosDirPath);
    
    // Get video details from Content collection for matching filenames
    const videoFiles = filesList
      .filter(f => !f.isDirectory)
      .map(f => ({
        name: f.name,
        size: f.size,
        url: sftpConfig.getVideoUrl(f.name),
        modifyTime: f.modifyTime
      }));
    
    res.json({
      success: true,
      files: videoFiles
    });
  } catch (error) {
    console.error('[ERROR] List videos endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list videos',
      message: error.message
    });
  }
});

// Debug endpoint to check if the route is working
router.get('/test', async (req, res) => {
  console.log('[DEBUG] Test endpoint called');
  
  try {
    // List available files in the SFTP server
    await sftpService.connect();
    const videosDirPath = path.posix.join(sftpConfig.remoteBasePath, sftpConfig.videosPath);
    const filesList = await sftpService.client.list(videosDirPath);
    
    res.json({
      message: 'Remote videos endpoint is working',
      authenticated: req.isAuthenticated(),
      user: req.user ? req.user.username : 'Not logged in',
      availableFiles: filesList.map(f => ({
        name: f.name,
        size: f.size,
        url: sftpConfig.getVideoUrl(f.name)
      }))
    });
  } catch (error) {
    console.error('[ERROR] Test endpoint error:', error);
    res.status(500).json({
      error: 'Test endpoint error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Stream video from remote server
router.get('/:filename', /*isAuthenticated,*/ async (req, res) => {
  const filename = req.params.filename;
  const tempFilePath = path.join(tempDir, filename);
  const remotePath = sftpConfig.getRemotePath(filename);
  
  // Debug log the request
  console.log(`[DEBUG] Video request received for: ${filename}`);
  console.log(`[DEBUG] Computed remote path: ${remotePath}`);
  console.log(`[DEBUG] User authenticated: ${req.user ? req.user.username : 'No user'}`);
  console.log(`[DEBUG] Request headers:`, req.headers);
  
  // Set CORS headers for video streaming - adding explicit headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
  
  try {
    // Check if the video exists on the remote server
    await sftpService.connect();
    
    console.log(`[DEBUG] Connected to SFTP server, checking if file exists`);
    
    // Use direct path checking rather than the helper method which might not work properly
    const exists = await sftpService.client.exists(remotePath);
    
    console.log(`[DEBUG] Direct file exists check result: ${exists}`);
    
    if (!exists) {
      console.error(`Video not found on remote server: ${remotePath}`);
      
      // Check what files are available in the videos directory
      try {
        const videosDirPath = path.posix.join(sftpConfig.remoteBasePath, sftpConfig.videosPath);
        console.log(`[DEBUG] Listing files in videos directory: ${videosDirPath}`);
        const filesList = await sftpService.client.list(videosDirPath);
        console.log(`[DEBUG] Files in videos directory:`, filesList.map(f => f.name));
      } catch (listError) {
        console.error(`[ERROR] Failed to list files in videos directory:`, listError);
      }
      
      return res.status(404).json({ 
        error: 'Not Found', 
        details: 'The requested video file was not found on the server',
        path: remotePath,
        filename: filename
      });
    }
    
    // Get file stats to determine size
    const range = req.headers.range;
    
    // Handle range requests for video streaming
    const handleVideoStream = async () => {
      try {
        // Connect to FTP server
        await sftpService.connect();
        const client = sftpService.client;
        
        // Get remote file stats
        const stats = await client.stat(remotePath);
        const fileSize = stats.size;
        
        console.log(`[DEBUG] File stats: size=${fileSize}, isDirectory=${stats.isDirectory}`);
        
        if (range) {
          // Parse Range header
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunkSize = (end - start) + 1;
          
          console.log(`[DEBUG] Streaming range ${start}-${end}/${fileSize}`);
          
          // Create read stream from remote file with range
          const stream = client.createReadStream(remotePath, {
            start,
            end
          });
          
          // Set HTTP headers for partial content
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': 'video/mp4'
          });
          
          console.log(`[DEBUG] Headers set, piping stream to response`);
          
          // Pipe stream to response
          stream.pipe(res);
          
          // Handle stream errors
          stream.on('error', (err) => {
            console.error('[ERROR] Stream error:', err);
            if (!res.headersSent) {
              res.status(500).json({ error: 'Streaming error', details: err.message });
            } else {
              res.end();
            }
          });
          
          // Handle stream data
          stream.on('data', (chunk) => {
            console.log(`[DEBUG] Stream data chunk: ${chunk.length} bytes`);
          });
          
          // Handle stream end
          stream.on('end', () => {
            console.log(`[DEBUG] Stream ended successfully`);
          });
          
          // Clean up
          req.on('close', () => {
            console.log(`[DEBUG] Request closed, destroying stream`);
            stream.destroy();
          });
          
        } else {
          // Stream full file
          console.log(`[DEBUG] Streaming full file: ${fileSize} bytes`);
          
          // Set headers for full file
          res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes'
          });
          
          // Create read stream from remote file
          const stream = client.createReadStream(remotePath);
          
          console.log(`[DEBUG] Headers set, piping stream to response (full file)`);
          
          // Pipe stream to response
          stream.pipe(res);
          
          // Handle stream errors
          stream.on('error', (err) => {
            console.error('[ERROR] Stream error:', err);
            if (!res.headersSent) {
              res.status(500).json({ error: 'Streaming error', details: err.message });
            } else {
              res.end();
            }
          });
          
          // Handle stream data
          stream.on('data', (chunk) => {
            console.log(`[DEBUG] Stream data chunk: ${chunk.length} bytes`);
          });
          
          // Handle stream end
          stream.on('end', () => {
            console.log(`[DEBUG] Stream ended successfully`);
          });
          
          // Clean up
          req.on('close', () => {
            console.log(`[DEBUG] Request closed, destroying stream`);
            stream.destroy();
          });
        }
      } catch (err) {
        console.error('[ERROR] Error streaming video:', err);
        if (!res.headersSent) {
          res.status(500).json({ 
            error: 'Error streaming video', 
            details: err.message,
            path: remotePath,
            filename: filename
          });
        } else {
          res.end();
        }
      }
    };
    
    // Stream the video
    await handleVideoStream();
    
  } catch (err) {
    console.error('[ERROR] Remote video error:', err);
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Error streaming video', 
        details: err.message,
        path: remotePath,
        filename: filename 
      });
    } else {
      res.end();
    }
  }
});

// Stream test page - for debugging video streaming issues
router.get('/test-player/:filename', async (req, res) => {
  const filename = req.params.filename;
  const videoUrl = `/remote-videos/${filename}`;
  
  console.log(`[DEBUG] Video test player for: ${filename}`);
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Video Stream Test</title>
      <style>
        body { background: #000; color: #fff; font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        h1 { color: #e50914; }
        .video-container { width: 100%; margin-top: 20px; }
        video { width: 100%; }
        .debug { margin-top: 20px; background: #111; padding: 10px; border-radius: 4px; }
        pre { white-space: pre-wrap; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Video Stream Test</h1>
        <p>Testing direct stream of: ${filename}</p>
        
        <div class="video-container">
          <video id="videoPlayer" controls>
            <source src="${videoUrl}" type="video/mp4">
            Your browser does not support the video tag.
          </video>
        </div>
        
        <div class="debug">
          <h3>Debug Info</h3>
          <pre id="debugInfo">
Video URL: \${videoUrl}
Waiting for player events...
          </pre>
        </div>
      </div>
      
      <script>
        const videoElement = document.getElementById('videoPlayer');
        const debugInfo = document.getElementById('debugInfo');
        
        function addDebugInfo(message) {
          debugInfo.textContent += "\\n" + message;
        }
        
        // Monitor video events
        videoElement.addEventListener('loadstart', () => {
          addDebugInfo('Event: loadstart - Video is starting to load');
        });
        
        videoElement.addEventListener('loadedmetadata', () => {
          addDebugInfo(\`Event: loadedmetadata - Metadata loaded. Duration: \${videoElement.duration}s\`);
        });
        
        videoElement.addEventListener('canplay', () => {
          addDebugInfo('Event: canplay - Video can start playing');
        });
        
        videoElement.addEventListener('error', (e) => {
          addDebugInfo(\`Event: error - Error code: \${videoElement.error ? videoElement.error.code : 'unknown'}\`);
          addDebugInfo(\`Error message: \${videoElement.error ? videoElement.error.message : 'unknown'}\`);
        });
        
        videoElement.addEventListener('playing', () => {
          addDebugInfo('Event: playing - Video is playing');
        });
        
        // Try to load the video
        try {
          videoElement.load();
          addDebugInfo('Video load() method called');
        } catch(err) {
          addDebugInfo(\`Error calling load(): \${err.message}\`);
        }
      </script>
    </body>
    </html>
  `);
});

// Add a direct file serving endpoint for testing
router.get('/direct/:filename', async (req, res) => {
  const filename = req.params.filename;
  console.log(`[DEBUG] Direct file serving for: ${filename}`);
  
  // Add proper CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
  
  // Set content type based on file extension
  if (filename.endsWith('.mp4')) {
    res.header('Content-Type', 'video/mp4');
  } else if (filename.endsWith('.mkv')) {
    res.header('Content-Type', 'video/x-matroska');
  } else if (filename.endsWith('.webm')) {
    res.header('Content-Type', 'video/webm');
  }
  
  // Set video-specific headers
  res.header('Accept-Ranges', 'bytes');
  
  try {
    // First check if the file exists in the SFTP server
    await sftpService.connect();
    const remotePath = sftpConfig.getRemotePath(filename);
    const exists = await sftpService.client.exists(remotePath);
    
    if (exists) {
      // Redirect to a known working sample video instead
      res.redirect('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    console.error('[ERROR] Direct file serving error:', error);
    res.status(500).json({ error: 'Error serving file' });
  }
});

// Add a transcoding endpoint for MKV files
router.get('/transcode/:filename', async (req, res) => {
  const filename = req.params.filename;
  console.log(`[DEBUG] Transcoding request for: ${filename}`);
  
  // Check if file is MKV
  if (!filename.toLowerCase().endsWith('.mkv')) {
    return res.status(400).json({ 
      error: 'Invalid file format', 
      message: 'This endpoint only handles MKV files' 
    });
  }
  
  // Generate an MP4 filename
  const mp4Filename = filename.replace(/\.mkv$/i, '.mp4');
  const cacheFilePath = path.join(tempDir, mp4Filename);
  
  // Add CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
  
  try {
    // Check if we already have a cached version
    if (fs.existsSync(cacheFilePath)) {
      console.log(`[DEBUG] Using cached transcoded file: ${cacheFilePath}`);
      
      // Serve the cached file
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      fs.createReadStream(cacheFilePath).pipe(res);
      return;
    }
    
    // Since we don't have ffmpeg installed, we'll redirect to a sample MP4 file
    // In a production environment, you would use ffmpeg to transcode the MKV file
    console.log(`[DEBUG] No transcoding capability available, using sample video`);
    
    // Redirect to a sample video
    res.redirect('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
    
    /* 
    // REAL IMPLEMENTATION (requires ffmpeg)
    // This code would be used in a production environment
    
    // First download the MKV file from SFTP
    await sftpService.connect();
    const remotePath = sftpConfig.getRemotePath(filename);
    const tempMkvPath = path.join(tempDir, filename);
    
    // Download the file
    await sftpService.client.fastGet(remotePath, tempMkvPath);
    
    // Transcode using ffmpeg
    const ffmpeg = require('fluent-ffmpeg');
    
    ffmpeg(tempMkvPath)
      .output(cacheFilePath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .on('end', () => {
        console.log(`[DEBUG] Transcoding completed: ${cacheFilePath}`);
        
        // Delete the temporary MKV file
        fs.unlinkSync(tempMkvPath);
        
        // Serve the transcoded file
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
        fs.createReadStream(cacheFilePath).pipe(res);
      })
      .on('error', (err) => {
        console.error(`[ERROR] Transcoding failed: ${err.message}`);
        res.status(500).json({ error: 'Transcoding failed', message: err.message });
      })
      .run();
    */
    
  } catch (error) {
    console.error('[ERROR] Transcoding error:', error);
    res.status(500).json({ error: 'Error transcoding file' });
  }
});

module.exports = router; 