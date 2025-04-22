const fs = require('fs');
const path = require('path');
const sftpService = require('./services/sftpService');

// Define test file
const testFileName = `test-${Date.now()}.mp4`;
const tempFilePath = path.join(__dirname, 'temp-uploads', testFileName);

// Create a simple test file (1MB of zeroes)
console.log(`Creating test file: ${tempFilePath}`);
const fd = fs.openSync(tempFilePath, 'w');
// Create a 1MB buffer filled with zeros
const buffer = Buffer.alloc(1024 * 1024);
fs.writeSync(fd, buffer, 0, buffer.length);
fs.closeSync(fd);

// Upload the test file
async function uploadTestFile() {
  try {
    console.log('Uploading test file...');
    const result = await sftpService.uploadFile(tempFilePath, testFileName);
    console.log('Upload result:', result);
    
    // Verify file exists
    const exists = await sftpService.fileExists(testFileName);
    console.log(`File exists check: ${exists}`);
    
    // Try to get file stats
    try {
      await sftpService.connect();
      const remotePath = require('./config/sftp').getRemotePath(testFileName);
      const stats = await sftpService.client.stat(remotePath);
      console.log('File stats:', stats);
    } catch (statError) {
      console.error('Error getting file stats:', statError);
    }
    
    // Clean up
    fs.unlinkSync(tempFilePath);
    console.log(`Removed local test file: ${tempFilePath}`);
    
    console.log(`Test complete. Video URL: ${result.videoUrl}`);
    console.log(`To test playback, go to: http://localhost:5002${result.videoUrl}`);
    
  } catch (err) {
    console.error('Error uploading test file:', err);
  } finally {
    try {
      await sftpService.disconnect();
    } catch (err) {
      console.error('Error disconnecting:', err);
    }
  }
}

// Run the test
uploadTestFile().then(() => {
  console.log('Test completed');
}).catch(err => {
  console.error('Test failed:', err);
}); 