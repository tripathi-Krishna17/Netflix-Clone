// SFTP Configuration for Ubuntu Server
const path = require('path');

// Default configuration for local Ubuntu server
const sftpConfig = {
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

// Log the SFTP configuration (without password) for debugging
console.log('SFTP Configuration:', {
  host: sftpConfig.host,
  port: sftpConfig.port,
  username: sftpConfig.username,
  hasPassword: !!sftpConfig.password,
  remoteBasePath: sftpConfig.remoteBasePath,
  videosPath: sftpConfig.videosPath
});

module.exports = sftpConfig; 