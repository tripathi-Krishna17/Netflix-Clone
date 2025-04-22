const path = require('path');

// Replacement for broken sftp.js file
const fixedSftpConfig = {
  host: process.env.SFTP_HOST || 'localhost',
  port: parseInt(process.env.SFTP_PORT || 2222),
  username: process.env.SFTP_USERNAME || 'ubuntu_user',
  password: process.env.SFTP_PASSWORD || 'Krishna@1709',
  privateKey: process.env.SFTP_PRIVATE_KEY_PATH ? 
    require('fs').readFileSync(process.env.SFTP_PRIVATE_KEY_PATH) : 
    undefined,
  remoteBasePath: process.env.SFTP_REMOTE_PATH || '/home/ubuntu_user/netflix_videos',
  videosPath: '/videos',
  readyTimeout: 20000, // 20 seconds
  debug: function(debug) {
    if (process.env.DEBUG_SFTP === 'true') {
      console.log('SFTP Debug:', debug);
    }
  },
  
  // Helper function to get the full remote path
  getRemotePath: function(filename) {
    return path.posix.join(this.remoteBasePath, this.videosPath, filename);
  },
  
  // Helper function to create a URL for videos
  getVideoUrl: function(filename) {
    return `/remote-videos/${filename}`;
  }
};

console.log('FIXED SFTP Configuration loaded');

module.exports = fixedSftpConfig; 