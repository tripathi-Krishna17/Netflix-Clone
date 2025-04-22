const mongoose = require('mongoose');
const Content = require('./models/content');
const sftpConfig = require('./config/sftp');
const sftpService = require('./services/sftpService');
const path = require('path');
const fs = require('fs');

// Connect to MongoDB
const MONGODB_URI = 'mongodb+srv://Krishna17:Pratibha1970@netflix.uje7uc2.mongodb.net/?retryWrites=true&w=majority&appName=Netflix';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
  fixVideoUrls();
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Function to fix video URLs
async function fixVideoUrls() {
  try {
    // Get all content with video URLs
    const content = await Content.find({ videoUrl: { $exists: true, $ne: null } });
    console.log(`Found ${content.length} items with video URLs`);
    
    if (content.length === 0) {
      console.log('No content with video URLs found');
      process.exit(0);
    }
    
    // Connect to SFTP
    await sftpService.connect();
    
    // List files in videos directory
    const videosDir = path.posix.join(sftpConfig.remoteBasePath, sftpConfig.videosPath);
    console.log(`Listing files in ${videosDir}`);
    
    let files = [];
    try {
      files = await sftpService.client.list(videosDir);
      console.log(`Found ${files.length} files in videos directory`);
      files.forEach(file => {
        console.log(`- ${file.name} (${file.size} bytes)`);
      });
    } catch (err) {
      console.error('Error listing files:', err);
    }
    
    // Check each content item
    for (const item of content) {
      console.log(`\nChecking ${item.title} (${item._id})`);
      console.log(`Current videoUrl: ${item.videoUrl}`);
      
      // Extract filename from URL
      const urlParts = item.videoUrl.split('/');
      const filename = urlParts[urlParts.length - 1];
      console.log(`Extracted filename: ${filename}`);
      
      // Check if file exists on server
      const remotePath = sftpConfig.getRemotePath(filename);
      const exists = await sftpService.client.exists(remotePath);
      console.log(`File exists on server: ${exists}`);
      
      if (!exists) {
        console.log(`File not found on server: ${remotePath}`);
        
        // Check if we have test.mp4 we can use
        const testExists = await sftpService.client.exists(path.posix.join(videosDir, 'test.mp4'));
        if (testExists) {
          console.log('Using test.mp4 as a replacement');
          item.videoUrl = '/remote-videos/test.mp4';
          await item.save();
          console.log(`Updated videoUrl to: ${item.videoUrl}`);
        } else {
          console.log('No replacement file available');
          // Just ensure URL format is correct
          if (!item.videoUrl.startsWith('/remote-videos/')) {
            item.videoUrl = '/remote-videos/' + filename;
            await item.save();
            console.log(`Updated URL format to: ${item.videoUrl}`);
          }
        }
      } else {
        // File exists, ensure URL format is correct
        if (!item.videoUrl.startsWith('/remote-videos/')) {
          item.videoUrl = '/remote-videos/' + filename;
          await item.save();
          console.log(`Updated URL format to: ${item.videoUrl}`);
        } else {
          console.log('URL format is correct, no changes needed');
        }
      }
    }
    
    console.log('\nFinished checking all content items');
    process.exit(0);
    
  } catch (err) {
    console.error('Error fixing video URLs:', err);
    process.exit(1);
  }
} 