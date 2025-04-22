#!/bin/bash

# This script ensures that the SFTP directories are properly set up

# Create the videos directory
mkdir -p /home/ubuntu_user/netflix_videos/videos

# Set the appropriate ownership
chown -R ubuntu_user:ubuntu_user /home/ubuntu_user/netflix_videos

# Set permissions
chmod -R 755 /home/ubuntu_user/netflix_videos

echo "SFTP directory structure and permissions set up successfully." 