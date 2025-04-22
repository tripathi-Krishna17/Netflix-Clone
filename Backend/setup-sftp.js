const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const SftpClient = require('ssh2-sftp-client');
const sftpConfig = require('./fix-sftp');

// Create a function to ensure the directory exists
async function setupSftpDirectories() {
  console.log('Starting SFTP directory setup...');
  
  // 1. First, make sure the local directory exists
  const localStoragePath = path.join(__dirname, 'ubuntu-server-storage');
  const localVideosPath = path.join(localStoragePath, 'videos');
  
  console.log(`Checking if local directories exist: ${localStoragePath}`);
  
  if (!fs.existsSync(localStoragePath)) {
    fs.mkdirSync(localStoragePath, { recursive: true });
    console.log(`Created local directory: ${localStoragePath}`);
  }
  
  if (!fs.existsSync(localVideosPath)) {
    fs.mkdirSync(localVideosPath, { recursive: true });
    console.log(`Created local videos directory: ${localVideosPath}`);
  }
  
  // 2. Now try to connect to SFTP and create the directories there
  const client = new SftpClient();
  
  try {
    console.log(`Connecting to SFTP server at ${sftpConfig.host}:${sftpConfig.port}...`);
    
    await client.connect({
      host: sftpConfig.host,
      port: sftpConfig.port,
      username: sftpConfig.username,
      password: sftpConfig.password
    });
    
    console.log('Connected to SFTP server');
    
    // Check if the base directory exists
    const baseDir = sftpConfig.remoteBasePath;
    console.log(`Checking if remote base directory exists: ${baseDir}`);
    
    let baseExists = false;
    try {
      baseExists = await client.exists(baseDir);
    } catch (e) {
      console.log(`Error checking base directory: ${e.message}`);
    }
    
    if (!baseExists) {
      console.log(`Creating remote base directory: ${baseDir}`);
      await client.mkdir(baseDir, true);
    }
    
    // Check if the videos directory exists
    const videosDir = path.posix.join(baseDir, 'videos');
    console.log(`Checking if remote videos directory exists: ${videosDir}`);
    
    let videosExists = false;
    try {
      videosExists = await client.exists(videosDir);
    } catch (e) {
      console.log(`Error checking videos directory: ${e.message}`);
    }
    
    if (!videosExists) {
      console.log(`Creating remote videos directory: ${videosDir}`);
      await client.mkdir(videosDir, true);
    }
    
    console.log('SFTP directories are set up successfully!');
    
  } catch (err) {
    console.error('Error setting up SFTP directories:', err);
  } finally {
    client.end();
  }
  
  // 3. Also try running a command on the Docker container
  try {
    console.log('Attempting to create directories via Docker exec...');
    
    exec('docker exec backend-ubuntu-sftp-1 mkdir -p /home/ubuntu_user/netflix_videos/videos', (error, stdout, stderr) => {
      if (error) {
        console.error(`Docker exec error: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`Docker stderr: ${stderr}`);
        return;
      }
      console.log(`Docker exec stdout: ${stdout}`);
    });
    
    // Now set permissions
    exec('docker exec backend-ubuntu-sftp-1 chmod -R 777 /home/ubuntu_user/netflix_videos', (error, stdout, stderr) => {
      if (error) {
        console.error(`Docker chmod error: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`Docker chmod stderr: ${stderr}`);
        return;
      }
      console.log(`Docker chmod stdout: ${stdout}`);
    });
    
  } catch (err) {
    console.error('Error running Docker commands:', err);
  }
}

// Run the setup
setupSftpDirectories().then(() => {
  console.log('Setup complete!');
}).catch(err => {
  console.error('Setup failed:', err);
}); 