// Three.js background animation for Netflix free watch page
document.addEventListener('DOMContentLoaded', () => {
  // Only initialize if the canvas exists
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;

  // Scene setup
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  
  // Renderer setup
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000, 0);
  
  // Light setup
  const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);

  // Create particles
  const particleCount = 1000;
  const particleGeometry = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(particleCount * 3);
  const particleSizes = new Float32Array(particleCount);
  
  // Create particle positions and sizes
  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    particlePositions[i3] = (Math.random() - 0.5) * 50;
    particlePositions[i3 + 1] = (Math.random() - 0.5) * 50;
    particlePositions[i3 + 2] = (Math.random() - 0.5) * 50 - 25;
    
    particleSizes[i] = Math.random() * 2;
  }
  
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  particleGeometry.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));
  
  // Particle material
  const particleMaterial = new THREE.PointsMaterial({
    color: 0xE50914, // Netflix red
    size: 0.1,
    transparent: true,
    blending: THREE.AdditiveBlending,
    opacity: 0.8,
    sizeAttenuation: true
  });
  
  // Create particle system
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particles);
  
  // Create a smoky atmosphere
  let smokeTexture;
  try {
    smokeTexture = new THREE.TextureLoader().load('/img/smoke.png', 
      // Success callback
      undefined, 
      // Progress callback
      undefined, 
      // Error callback
      (err) => {
        console.warn('Failed to load smoke texture:', err);
        // Use programmatically generated texture if available
        if (window.createSmokeTexture) {
          const textureData = window.createSmokeTexture();
          smokeTexture = new THREE.TextureLoader().load(textureData);
          // Update all smoke planes with new texture
          smokePlanes.forEach(plane => {
            plane.material.map = smokeTexture;
            plane.material.needsUpdate = true;
          });
        }
      }
    );
  } catch (error) {
    console.warn('Error creating smoke texture:', error);
    // Use programmatically generated texture
    if (window.createSmokeTexture) {
      const textureData = window.createSmokeTexture();
      smokeTexture = new THREE.TextureLoader().load(textureData);
    }
  }
  
  const smokeGeometry = new THREE.PlaneGeometry(60, 60);
  const smokeMaterial = new THREE.MeshLambertMaterial({
    map: smokeTexture,
    transparent: true,
    opacity: 0.15
  });
  
  // Create multiple smoke planes
  const smokeCount = 8;
  const smokePlanes = [];
  
  for (let i = 0; i < smokeCount; i++) {
    const smoke = new THREE.Mesh(smokeGeometry, smokeMaterial);
    smoke.position.z = -20 + (i * 5);
    smoke.rotation.z = Math.random() * Math.PI;
    smokePlanes.push(smoke);
    scene.add(smoke);
  }
  
  // Camera position
  camera.position.z = 30;

  // Animation settings
  let mouseX = 0;
  let mouseY = 0;
  document.addEventListener('mousemove', (event) => {
    mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    mouseY = (event.clientY / window.innerHeight) * 2 - 1;
  });

  // Handle window resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
    
    // Rotate particles
    particles.rotation.x += 0.0003;
    particles.rotation.y += 0.0005;
    
    // Move particles based on mouse position
    particles.rotation.x += mouseY * 0.0005;
    particles.rotation.y += mouseX * 0.0005;
    
    // Animate smoke planes
    smokePlanes.forEach((smoke, index) => {
      smoke.rotation.z += 0.001 * (index % 2 === 0 ? 1 : -1);
    });
    
    // Camera subtle movement
    camera.position.x += (mouseX * 2 - camera.position.x) * 0.01;
    camera.position.y += (-mouseY * 2 - camera.position.y) * 0.01;
    
    renderer.render(scene, camera);
  }
  
  // Start animation
  animate();

  // Fade in the background when video is playing
  const videoPlayer = document.getElementById('player');
  if (videoPlayer) {
    videoPlayer.addEventListener('play', () => {
      // Gradually fade out the background
      let opacity = 1;
      const fadeInterval = setInterval(() => {
        opacity -= 0.05;
        if (opacity <= 0.3) {
          opacity = 0.3;
          clearInterval(fadeInterval);
        }
        canvas.style.opacity = opacity;
      }, 100);
    });

    videoPlayer.addEventListener('pause', () => {
      // Gradually fade in the background
      let opacity = parseFloat(canvas.style.opacity) || 0.3;
      const fadeInterval = setInterval(() => {
        opacity += 0.05;
        if (opacity >= 1) {
          opacity = 1;
          clearInterval(fadeInterval);
        }
        canvas.style.opacity = opacity;
      }, 100);
    });
  }

  // Add pulsing effect for the upgrade button
  const upgradeButton = document.getElementById('upgrade-button');
  if (upgradeButton) {
    setInterval(() => {
      upgradeButton.classList.add('animate-pulse');
      setTimeout(() => {
        upgradeButton.classList.remove('animate-pulse');
      }, 2000);
    }, 5000);
  }
}); 