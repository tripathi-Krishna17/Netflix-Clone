# Setting Up a Local Ubuntu Server for Netflix Clone Movie Storage

This guide will help you set up an Ubuntu server locally to store movies for your Netflix Clone application.

## Option 1: Using Docker (Recommended)

### Prerequisites
- Docker installed on your machine
- Basic knowledge of terminal/command line

### Steps

1. **Create a Docker Compose File**

   Create a file named `docker-compose.yml` in your project root:

   ```yaml
   version: '3'
   
   services:
     ubuntu-sftp:
       image: atmoz/sftp
       ports:
         - "2222:22"
       volumes:
         - ./ubuntu-server-storage:/home/ubuntu_user/netflix_videos
       command: ubuntu_user:your_password:1001
       restart: unless-stopped
   ```

2. **Create Storage Directory**

   ```bash
   mkdir -p ubuntu-server-storage
   ```

3. **Start the SFTP Server**

   ```bash
   docker-compose up -d
   ```

4. **Update Your .env File**

   ```
   SFTP_HOST=localhost
   SFTP_PORT=2222
   SFTP_USERNAME=ubuntu_user
   SFTP_PASSWORD=your_password
   SFTP_REMOTE_PATH=/home/ubuntu_user/netflix_videos
   ```

5. **Restart Your Node.js Application**

   ```bash
   npm start
   ```

## Option 2: Using VirtualBox and Ubuntu Server

### Prerequisites
- VirtualBox installed on your machine
- Ubuntu Server ISO downloaded

### Steps

1. **Install Ubuntu Server on VirtualBox**
   - Create a new virtual machine in VirtualBox
   - Select "Ubuntu (64-bit)" as the type
   - Allocate at least 4GB RAM and 50GB disk space
   - Mount the Ubuntu Server ISO and install the OS
   - During installation, set username to "ubuntu_user" and choose a password

2. **Configure SSH/SFTP on Ubuntu Server**

   ```bash
   # Log in to your Ubuntu Server VM and run:
   sudo apt update
   sudo apt install -y openssh-server
   
   # Create directory for storage
   mkdir -p ~/netflix_videos/videos
   ```

3. **Configure Port Forwarding in VirtualBox**
   - Go to VM Settings > Network > Advanced > Port Forwarding
   - Add a new rule:
     - Name: SSH
     - Protocol: TCP
     - Host IP: 127.0.0.1
     - Host Port: 2222
     - Guest IP: leave empty
     - Guest Port: 22

4. **Update Your .env File**

   ```
   SFTP_HOST=localhost
   SFTP_PORT=2222
   SFTP_USERNAME=ubuntu_user
   SFTP_PASSWORD=your_password
   SFTP_REMOTE_PATH=/home/ubuntu_user/netflix_videos
   ```

5. **Restart Your Node.js Application**

   ```bash
   npm start
   ```

## Option 3: Using WSL2 on Windows

If you're on Windows, you can use WSL2 (Windows Subsystem for Linux) to run Ubuntu locally.

### Prerequisites
- Windows 10 version 2004 or higher
- WSL2 installed

### Steps

1. **Install WSL2 and Ubuntu**

   Open PowerShell as administrator and run:
   ```powershell
   wsl --install -d Ubuntu
   ```

2. **Configure Ubuntu for SFTP**

   ```bash
   # In your Ubuntu WSL terminal:
   sudo apt update
   sudo apt install -y openssh-server
   
   # Enable SSH server
   sudo systemctl enable ssh
   sudo systemctl start ssh
   
   # Create storage directory
   mkdir -p ~/netflix_videos/videos
   ```

3. **Get the WSL2 IP Address**

   ```bash
   ip addr show eth0 | grep "inet\b" | awk '{print $2}' | cut -d/ -f1
   ```

4. **Update Your .env File**

   ```
   SFTP_HOST=<your-wsl2-ip-address>
   SFTP_PORT=22
   SFTP_USERNAME=<your-wsl-username>
   SFTP_PASSWORD=<your-wsl-password>
   SFTP_REMOTE_PATH=/home/<your-wsl-username>/netflix_videos
   ```

5. **Restart Your Node.js Application**

   ```bash
   npm start
   ```

## Testing Your Setup

After setting up the Ubuntu server using any of the methods above, you can test the SFTP connection using an SFTP client like FileZilla or the `sftp` command-line tool:

```bash
sftp -P 2222 ubuntu_user@localhost
# Enter password when prompted
```

You should now be able to upload videos through your application, and they'll be stored on your Ubuntu server instead of locally. 