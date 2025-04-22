/**
 * Video player initialization and control for Netflix free watch experience
 * This script handles video playback, preview limitations, and background animation integration
 */

// Initialize player with options and handle background animation
function initializePlayer(options = {}) {
  const videoId = options.videoId || '';
  const previewDuration = options.previewDuration || 180; // Default 3 minutes
  const isPreview = options.isPreview || false;
  
  // Get DOM elements
  const videoElement = document.getElementById('player');
  const bgCanvas = document.getElementById('bg-canvas');
  
  // Initialize Plyr with our preferred options
  const player = new Plyr(videoElement, {
    controls: [
      'play-large',
      'play',
      'progress',
      'current-time',
      'mute',
      'volume',
      'fullscreen'
    ],
    autopause: true,
    fullscreen: { enabled: true, fallback: true, iosNative: true },
    ratio: '16:9',
    storage: { enabled: false } // Don't remember position for previews
  });
  
  // Track video playback analytics
  player.on('ready', () => {
    console.log('Player ready for', videoId);
    
    // Inform backend about video view start
    if (videoId) {
      fetch('/api/watch/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          videoId: videoId,
          isPreview: isPreview
        })
      }).catch(err => console.error('Failed to record watch start:', err));
    }
  });
  
  // Handle different player events
  player.on('play', () => {
    // Fade the background animation
    if (typeof fadeBackground === 'function') {
      fadeBackground(0.2); // Fade to 20% opacity when video plays
    }
    
    // Add playing class to body for additional styling if needed
    document.body.classList.add('video-playing');
  });
  
  player.on('pause', () => {
    // Bring background animation back
    if (typeof fadeBackground === 'function') {
      fadeBackground(1.0); // Full opacity when paused
    }
    
    document.body.classList.remove('video-playing');
  });
  
  player.on('ended', () => {
    console.log('Video playback completed');
    
    // Show the preview end modal if this is a preview
    if (isPreview) {
      const previewEndModal = document.getElementById('preview-end-modal');
      if (previewEndModal) {
        previewEndModal.classList.add('visible');
      }
    }
    
    // Record view completion
    if (videoId) {
      fetch('/api/watch/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          videoId: videoId,
          isPreview: isPreview,
          watchedDuration: player.currentTime
        })
      }).catch(err => console.error('Failed to record watch completion:', err));
    }
    
    // Reset background animation
    if (typeof fadeBackground === 'function') {
      fadeBackground(1.0);
    }
    
    document.body.classList.remove('video-playing');
  });
  
  // Enforce preview time limit if needed
  if (isPreview) {
    player.on('timeupdate', () => {
      if (player.currentTime >= previewDuration) {
        player.pause();
        
        const previewEndModal = document.getElementById('preview-end-modal');
        if (previewEndModal) {
          previewEndModal.classList.add('visible');
        }
      }
    });
  }
  
  // Return player instance for other operations if needed
  return player;
}

// Handle keyboard shortcuts
document.addEventListener('keydown', (e) => {
  const player = document.querySelector('.plyr');
  if (!player) return;
  
  const plyrInstance = player.plyr;
  
  switch (e.key.toLowerCase()) {
    case 'f':
      // Toggle fullscreen
      if (plyrInstance) {
        plyrInstance.fullscreen.toggle();
      }
      break;
    case ' ':
      // Space bar - toggle play/pause
      if (plyrInstance) {
        if (plyrInstance.playing) {
          plyrInstance.pause();
        } else {
          plyrInstance.play();
        }
        e.preventDefault(); // Prevent page scroll on space
      }
      break;
    case 'arrowright':
      // Fast forward 10s
      if (plyrInstance) {
        plyrInstance.forward(10);
        e.preventDefault();
      }
      break;
    case 'arrowleft':
      // Rewind 10s
      if (plyrInstance) {
        plyrInstance.rewind(10);
        e.preventDefault();
      }
      break;
    case 'm':
      // Toggle mute
      if (plyrInstance) {
        plyrInstance.muted = !plyrInstance.muted;
      }
      break;
  }
});

// Handle video quality selection based on network conditions
function optimizeVideoQuality() {
  if (!navigator.connection) return;
  
  const connection = navigator.connection;
  const videoElement = document.getElementById('player');
  
  // If on slow connection, try to reduce quality
  if (connection.downlink < 1.5 || connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
    if (videoElement && videoElement.plyr) {
      // If plyr has quality options available, select lowest
      const qualities = videoElement.plyr.quality;
      if (qualities && qualities.options && qualities.options.length > 1) {
        // Find lowest quality option (excluding 'Default')
        const lowestQuality = Math.min(
          ...qualities.options
            .filter(option => typeof option === 'number')
        );
        
        if (lowestQuality) {
          videoElement.plyr.quality = lowestQuality;
        }
      }
    }
  }
}

// Try to optimize quality when connection changes
if (navigator.connection) {
  navigator.connection.addEventListener('change', optimizeVideoQuality);
}

// Initial optimization attempt
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(optimizeVideoQuality, 1000);
});

// Show movie recommendations
function showRecommendations() {
  const recommendationsContainer = document.createElement('div');
  recommendationsContainer.className = 'fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center';
  recommendationsContainer.innerHTML = `
    <div class="bg-gray-900 p-6 rounded-lg max-w-2xl w-full m-4">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-2xl font-bold">Recommended for You</h2>
        <button class="text-gray-400 hover:text-white" id="close-recommendations">
          <i class="fas fa-times text-xl"></i>
        </button>
      </div>
      <div class="flex overflow-x-auto pb-4 space-x-4" id="recommendations-list">
        <div class="animate-pulse">
          <div class="bg-gray-700 w-40 h-60 rounded"></div>
          <div class="bg-gray-700 w-32 h-4 mt-2 rounded"></div>
        </div>
        <div class="animate-pulse">
          <div class="bg-gray-700 w-40 h-60 rounded"></div>
          <div class="bg-gray-700 w-32 h-4 mt-2 rounded"></div>
        </div>
        <div class="animate-pulse">
          <div class="bg-gray-700 w-40 h-60 rounded"></div>
          <div class="bg-gray-700 w-32 h-4 mt-2 rounded"></div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(recommendationsContainer);

  // Close button functionality
  document.getElementById('close-recommendations').addEventListener('click', () => {
    recommendationsContainer.remove();
  });

  // Fetch recommendations
  fetchRecommendations();
}

// Fetch movie recommendations from the server
function fetchRecommendations() {
  const movieId = new URLSearchParams(window.location.search).get('id');
  if (!movieId) return;

  fetch(`/movies/${movieId}/recommendations`)
    .then(response => response.json())
    .then(data => {
      const recommendationsList = document.getElementById('recommendations-list');
      if (recommendationsList) {
        recommendationsList.innerHTML = '';
        
        data.forEach(movie => {
          const movieCard = document.createElement('div');
          movieCard.className = 'flex-shrink-0';
          movieCard.innerHTML = `
            <a href="/movies/${movie._id}" class="block">
              <div class="relative w-40 h-60 bg-gray-800 rounded overflow-hidden">
                <img src="${movie.posterPath || '/img/no-poster.jpg'}" 
                     alt="${movie.title}" 
                     class="w-full h-full object-cover">
                ${movie.isFree ? '<span class="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">FREE</span>' : ''}
              </div>
              <h3 class="mt-2 text-sm font-medium truncate">${movie.title}</h3>
            </a>
          `;
          recommendationsList.appendChild(movieCard);
        });
      }
    })
    .catch(error => {
      console.error('Failed to fetch recommendations:', error);
    });
} 