const SftpClient = require('ssh2-sftp-client');
const fs = require('fs');
const path = require('path');
const sftpConfig = require('../fix-sftp');

class SftpService {
  constructor() {
    this.client = new SftpClient();
    this.isConnected = false;
  }

  async connect() {
    try {
      // Always disconnect first to prevent "already connected" errors
      try {
        await this.disconnect();
      } catch (disconnectError) {
        // Ignore disconnect errors
        console.log('Disconnect before connect ignored error:', disconnectError.message);
      }
      
      console.log(`Attempting to connect to SFTP server at ${sftpConfig.host}:${sftpConfig.port} as ${sftpConfig.username}...`);
      console.log('SFTP Configuration:', {
        host: sftpConfig.host,
        port: sftpConfig.port,
        username: sftpConfig.username,
        hasPassword: !!sftpConfig.password,
        passwordLength: sftpConfig.password ? sftpConfig.password.length : 0,
        remoteBasePath: sftpConfig.remoteBasePath,
        videosPath: sftpConfig.videosPath
      });
      
      await this.client.connect(sftpConfig);
      this.isConnected = true;
      console.log('SFTP connection established successfully!');
      
      // Ensure base path exists
      await this.ensureDirectoryExists(sftpConfig.remoteBasePath);
      
      // Ensure videos directory exists
      const videoDir = path.posix.join(sftpConfig.remoteBasePath, sftpConfig.videosPath);
      await this.ensureDirectoryExists(videoDir);
      
    } catch (err) {
      this.isConnected = false;
      console.error('SFTP connection error:', {
        message: err.message,
        code: err.code,
        level: err.level
      });
      
      // Provide more specific error messages based on the error
      if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
        throw new Error(`Could not connect to SFTP server at ${sftpConfig.host}:${sftpConfig.port}. Is the server running?`);
      } else if (err.level === 'client-authentication') {
        throw new Error('SFTP authentication failed. Please check username and password.');
      } else {
        throw new Error(`SFTP connection error: ${err.message}`);
      }
    }
  }

  async disconnect() {
    if (this.isConnected) {
      await this.client.end();
      this.isConnected = false;
      console.log('SFTP connection closed');
    }
  }

  async uploadFile(localFilePath, remoteFileName, progressCallback = null) {
    try {
      await this.connect();
      
      // Make sure the videos directory exists - this is crucial
      const videosDir = path.posix.join(sftpConfig.remoteBasePath, sftpConfig.videosPath);
      await this.ensureDirectoryExists(videosDir);
      
      const remotePath = sftpConfig.getRemotePath(remoteFileName);
      console.log(`[DEBUG] Uploading file from ${localFilePath} to ${remotePath}`);
      
      // Check if source file exists
      if (!fs.existsSync(localFilePath)) {
        throw new Error(`Source file does not exist: ${localFilePath}`);
      }
      
      // Get file size for logging and progress tracking
      const stats = fs.statSync(localFilePath);
      const totalSize = stats.size;
      console.log(`[DEBUG] Uploading file size: ${totalSize} bytes`);
      
      // Check if the file already exists at the destination
      const exists = await this.client.exists(remotePath);
      if (exists) {
        console.log(`[DEBUG] File already exists at destination, will overwrite: ${remotePath}`);
      }
      
      // If we have a progress callback, use a custom implementation with progress tracking
      if (progressCallback && typeof progressCallback === 'function') {
        return await this.uploadWithProgress(localFilePath, remotePath, remoteFileName, totalSize, progressCallback);
      } else {
        // Standard upload without progress tracking
        const fileStream = fs.createReadStream(localFilePath);
        await this.client.put(fileStream, remotePath);
        console.log(`[DEBUG] Successfully uploaded file to ${remotePath}`);
        
        // Verify that the file exists after upload
        const verifyExists = await this.client.exists(remotePath);
        if (!verifyExists) {
          console.error(`[ERROR] File upload verification failed. File not found at: ${remotePath}`);
          throw new Error(`File upload verification failed. File not found after upload.`);
        }
        
        // Try to correct permissions if needed
        try {
          await this.client.chmod(remotePath, 0o644);
          console.log(`[DEBUG] Set permissions for ${remotePath}`);
        } catch (chmodError) {
          console.warn(`[WARN] Couldn't set file permissions: ${chmodError.message}`);
        }
        
        // Return success info
        return {
          success: true,
          fileName: remoteFileName,
          videoUrl: sftpConfig.getVideoUrl(remoteFileName)
        };
      }
    } catch (err) {
      console.error('[ERROR] SFTP upload error:', {
        message: err.message,
        code: err.code,
        errno: err.errno,
        systemCall: err.syscall
      });
      
      // Try an alternative approach if the normal upload fails
      if (err.message.includes('ENOENT') || err.message.includes('No such file')) {
        console.log(`[DEBUG] Trying alternative upload approach with recursive directory creation...`);
        try {
          // Try creating all directories in the path
          const dirPath = path.posix.dirname(remotePath);
          await this.client.mkdir(dirPath, true);
          
          // Try the upload again
          const fileStream = fs.createReadStream(localFilePath);
          await this.client.put(fileStream, remotePath);
          
          console.log(`[DEBUG] Alternative upload succeeded to ${remotePath}`);
          return {
            success: true,
            fileName: remoteFileName,
            videoUrl: sftpConfig.getVideoUrl(remoteFileName)
          };
        } catch (retryErr) {
          console.error('[ERROR] Alternative upload also failed:', retryErr);
          throw retryErr;
        }
      }
      
      // More detailed error explanation
      if (err.code === 'ENOENT') {
        throw new Error(`File not found: ${err.path}`);
      } else if (err.code === 'EACCES') {
        throw new Error('Permission denied. Check file permissions and SFTP user rights.');
      } else {
        throw new Error(`SFTP upload error: ${err.message}`);
      }
    }
  }

  // Custom implementation for tracking upload progress
  async uploadWithProgress(localFilePath, remotePath, remoteFileName, totalSize, progressCallback) {
    return new Promise((resolve, reject) => {
      try {
        const fileStream = fs.createReadStream(localFilePath);
        let uploadedBytes = 0;
        let lastProgressUpdate = 0;
        const updateInterval = 250; // Update progress every 250ms at most
        let lastUpdate = Date.now();

        // Track data chunks to monitor progress
        fileStream.on('data', (chunk) => {
          uploadedBytes += chunk.length;
          const now = Date.now();
          
          // Only send updates at reasonable intervals to prevent UI flooding
          if (now - lastUpdate >= updateInterval) {
            const progress = {
              percent: Math.round((uploadedBytes / totalSize) * 100),
              uploaded: uploadedBytes,
              total: totalSize,
              fileName: path.basename(localFilePath),
              timeStamp: now
            };
            
            progressCallback(progress);
            lastUpdate = now;
          }
        });

        // Handle the upload
        this.client.put(fileStream, remotePath)
          .then(() => {
            // Ensure 100% progress is reported at the end
            const progress = {
              percent: 100,
              uploaded: totalSize,
              total: totalSize,
              fileName: path.basename(localFilePath),
              timeStamp: Date.now()
            };
            progressCallback(progress);
            
            console.log(`Successfully uploaded file to ${remotePath}`);
            resolve({
              success: true,
              fileName: remoteFileName,
              videoUrl: sftpConfig.getVideoUrl(remoteFileName)
            });
          })
          .catch((err) => {
            reject(err);
          });
      } catch (err) {
        reject(err);
      }
    });
  }

  async deleteFile(remoteFileName) {
    try {
      await this.connect();
      const remotePath = sftpConfig.getRemotePath(remoteFileName);
      
      if (await this.client.exists(remotePath)) {
        await this.client.delete(remotePath);
        console.log(`Successfully deleted file: ${remotePath}`);
        return true;
      } else {
        console.log(`File does not exist: ${remotePath}`);
        return false;
      }
    } catch (err) {
      console.error('SFTP delete error:', err);
      throw new Error(`Failed to delete remote file: ${err.message}`);
    }
  }

  async fileExists(remoteFileName) {
    try {
      await this.connect();
      const remotePath = sftpConfig.getRemotePath(remoteFileName);
      console.log(`[DEBUG] Checking if file exists: ${remotePath}`);
      
      // Use the full path directly for existence check
      const exists = await this.client.exists(remotePath);
      
      console.log(`[DEBUG] File exists check for ${remotePath}: ${exists}`);
      
      // If file doesn't exist, list the contents of the directory to help debug
      if (!exists) {
        try {
          const dirPath = path.posix.dirname(remotePath);
          console.log(`[DEBUG] Listing contents of ${dirPath}:`);
          const files = await this.client.list(dirPath);
          console.log(`[DEBUG] Files in directory: ${files.map(f => f.name).join(', ')}`);
        } catch (listError) {
          console.log(`[DEBUG] Error listing directory: ${listError.message}`);
        }
      }
      
      return exists;
    } catch (err) {
      console.error('[ERROR] SFTP check error:', err);
      throw new Error(`Failed to check if remote file exists: ${err.message}`);
    }
  }

  // Helper method to ensure a directory exists
  async ensureDirectoryExists(dirPath) {
    try {
      console.log(`Checking if directory exists: ${dirPath}`);
      const exists = await this.client.exists(dirPath);
      
      if (!exists) {
        console.log(`Directory does not exist, creating: ${dirPath}`);
        await this.client.mkdir(dirPath, true);
        console.log(`Successfully created directory: ${dirPath}`);
      } else {
        console.log(`Directory already exists: ${dirPath}`);
        
        // Check if it's actually a directory
        const stats = await this.client.stat(dirPath);
        if (!stats.isDirectory) {
          console.log(`Path exists but is not a directory: ${dirPath}, attempting to create proper directory`);
          // Try to delete and recreate
          try {
            await this.client.delete(dirPath);
            await this.client.mkdir(dirPath, true);
            console.log(`Successfully created directory after removing file: ${dirPath}`);
          } catch (recreateError) {
            console.error(`Error recreating directory: ${recreateError.message}`);
            throw new Error(`Path exists but is not a directory: ${dirPath}`);
          }
        }
      }
      return true;
    } catch (error) {
      console.error(`Error ensuring directory exists (${dirPath}):`, error);
      throw new Error(`Failed to create directory ${dirPath}: ${error.message}`);
    }
  }
}

// Create a singleton instance
const sftpService = new SftpService();

module.exports = sftpService; 