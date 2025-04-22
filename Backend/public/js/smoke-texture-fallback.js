// Fallback for smoke texture if image is not available
document.addEventListener('DOMContentLoaded', () => {
  // Function to create a programmatic smoke texture if the image fails to load
  function createSmokeTexture() {
    // Create a canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = 512;
    canvas.height = 512;
    
    // Draw smoke-like texture
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Create some "smoke" particles
    ctx.fillStyle = 'white';
    ctx.globalAlpha = 0.05;
    
    for (let i = 0; i < 100; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const radius = Math.random() * 50 + 10;
      
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Add some blur for a smoother effect
    ctx.filter = 'blur(8px)';
    ctx.globalAlpha = 0.1;
    
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const radius = Math.random() * 100 + 50;
      
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    
    return canvas.toDataURL('image/png');
  }
  
  // Expose to global scope for Three.js to use
  window.createSmokeTexture = createSmokeTexture;
}); 