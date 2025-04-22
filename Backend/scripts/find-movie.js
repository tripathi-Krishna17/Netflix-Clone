const mongoose = require('mongoose');
const Content = require('../models/content');

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://Krishna17:Pratibha1970@netflix.uje7uc2.mongodb.net/?retryWrites=true&w=majority&appName=Netflix';

// Get movie title from command line arguments
const searchTitle = process.argv[2] || 'Passengers';

async function main() {
  try {
    console.log(`Searching for movie with title: "${searchTitle}"`);
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find movie by exact title match (case insensitive)
    const exactMatch = await Content.findOne({
      type: 'movie',
      title: new RegExp(`^${searchTitle}$`, 'i')
    });
    
    if (exactMatch) {
      console.log('\nFound exact match:');
      console.log({
        id: exactMatch._id,
        title: exactMatch.title,
        hasVideo: !!exactMatch.videoUrl,
        videoUrl: exactMatch.videoUrl || 'none',
        isFree: exactMatch.isFree,
        tmdbId: exactMatch.tmdbId
      });
    } else {
      console.log(`\nNo exact match found for: "${searchTitle}"`);
    }
    
    // Find movies that contain the search term in title
    const partialMatches = await Content.find({
      type: 'movie',
      title: { $regex: searchTitle, $options: 'i' }
    }).select('_id title videoUrl isFree tmdbId');
    
    if (partialMatches.length > 0) {
      console.log(`\nFound ${partialMatches.length} partial matches:`);
      partialMatches.forEach((movie, index) => {
        console.log(`${index + 1}. ${movie.title} (ID: ${movie._id})`);
        console.log(`   Video: ${movie.videoUrl || 'none'}`);
        console.log(`   Free: ${movie.isFree}`);
        console.log(`   TMDB ID: ${movie.tmdbId}`);
      });
    } else {
      console.log(`\nNo partial matches found for: "${searchTitle}"`);
    }
    
    // Find all movies with videoUrl
    console.log('\nListing all movies with videoUrl:');
    const moviesWithVideo = await Content.find({
      type: 'movie',
      videoUrl: { $exists: true, $ne: null }
    }).select('title videoUrl');
    
    if (moviesWithVideo.length > 0) {
      console.log(`Found ${moviesWithVideo.length} movies with videoUrl:`);
      moviesWithVideo.forEach(movie => {
        console.log(`- ${movie.title}: ${movie.videoUrl}`);
      });
    } else {
      console.log('No movies with videoUrl found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

main().catch(console.error); 