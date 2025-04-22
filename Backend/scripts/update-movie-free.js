const mongoose = require('mongoose');
const Content = require('../models/content');

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://Krishna17:Pratibha1970@netflix.uje7uc2.mongodb.net/?retryWrites=true&w=majority&appName=Netflix';

// Get movie title from command line arguments or default to Passengers
const movieTitle = process.argv[2] || 'Passengers';
const setFree = process.argv[3] !== 'false'; // Default to making it free

async function main() {
  try {
    console.log(`Updating movie "${movieTitle}" to ${setFree ? 'free' : 'premium'} status...`);
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find the movie
    const movie = await Content.findOne({
      type: 'movie',
      title: new RegExp(`^${movieTitle}$`, 'i')
    });
    
    if (!movie) {
      console.error(`Movie "${movieTitle}" not found in database`);
      return;
    }
    
    console.log('Found movie:');
    console.log({
      id: movie._id,
      title: movie.title,
      currentFreeStatus: movie.isFree,
      videoUrl: movie.videoUrl || 'none'
    });
    
    // Update the movie's isFree status
    movie.isFree = setFree;
    await movie.save();
    
    console.log(`\nMovie "${movie.title}" successfully updated!`);
    console.log(`Free status changed from ${!setFree} to ${setFree}`);
    
    // Verify the update
    const updatedMovie = await Content.findById(movie._id);
    console.log('\nVerification:');
    console.log({
      id: updatedMovie._id,
      title: updatedMovie.title,
      isFree: updatedMovie.isFree,
      videoUrl: updatedMovie.videoUrl || 'none'
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

main().catch(console.error); 