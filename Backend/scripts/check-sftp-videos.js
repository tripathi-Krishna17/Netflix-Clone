const mongoose = require('mongoose');
const sftpService = require('../services/sftpService');
const sftpConfig = require('../config/sftp');
const Content = require('../models/content');
const path = require('path');

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://Krishna17:Pratibha1970@netflix.uje7uc2.mongodb.net/?retryWrites=true&w=majority&appName=Netflix';

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // List all movies with videoUrl
    console.log('\nFetching movies with videoUrl from database...');
    const moviesWithVideo = await Content.find({
      type: 'movie',
      videoUrl: { $exists: true, $ne: null }
    }).select('title videoUrl');

    console.log(`Found ${moviesWithVideo.length} movies with videoUrl:`);
    moviesWithVideo.forEach(movie => {
      console.log(`- ${movie.title}: ${movie.videoUrl}`);
    });
    
    // Get remote videos from SFTP server
    console.log('\nConnecting to SFTP server to list available videos...');
    await sftpService.connect();
    const videosDirPath = path.posix.join(sftpConfig.remoteBasePath, sftpConfig.videosPath);
    
    console.log(`Listing files in SFTP directory: ${videosDirPath}`);
    const filesList = await sftpService.client.list(videosDirPath);
    
    const videoFiles = filesList
      .filter(f => !f.isDirectory)
      .map(f => ({
        name: f.name,
        size: f.size,
        url: sftpConfig.getVideoUrl(f.name),
        modifyTime: f.modifyTime
      }));
    
    console.log(`\nFound ${videoFiles.length} videos on SFTP server:`);
    videoFiles.forEach(file => {
      console.log(`- ${file.name} (${formatSize(file.size)}): ${file.url}`);
    });
    
    // Check which SFTP videos are not linked to content
    console.log('\nSFTP videos not linked to any content in database:');
    const linkedVideoUrls = moviesWithVideo.map(m => m.videoUrl);
    const unlinkedVideos = videoFiles.filter(file => 
      !linkedVideoUrls.includes(file.url)
    );
    
    if (unlinkedVideos.length === 0) {
      console.log('All SFTP videos are linked to content.');
    } else {
      unlinkedVideos.forEach(video => {
        console.log(`- ${video.name} (${formatSize(video.size)}): ${video.url}`);
      });
    }
    
    // Check for broken videoUrl links
    console.log('\nChecking for broken videoUrl links in database...');
    const sftpVideoUrls = videoFiles.map(f => f.url);
    const brokenLinks = moviesWithVideo.filter(movie => 
      movie.videoUrl.startsWith('/remote-videos/') && 
      !sftpVideoUrls.includes(movie.videoUrl)
    );
    
    if (brokenLinks.length === 0) {
      console.log('No broken videoUrl links found.');
    } else {
      console.log(`Found ${brokenLinks.length} movies with broken SFTP video links:`);
      brokenLinks.forEach(movie => {
        console.log(`- ${movie.title}: ${movie.videoUrl}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Close connections
    try {
      await sftpService.disconnect();
      await mongoose.disconnect();
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
    console.log('\nDone.');
  }
}

function formatSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Run the main function
main().catch(console.error); 