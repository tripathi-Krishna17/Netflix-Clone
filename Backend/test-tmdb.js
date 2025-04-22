const axios = require('axios');

// API key provided in the code
const TMDB_API_KEY = '6ec9180bfc843aba1677d9ff1b531116';

async function testTmdbApi() {
    try {
        console.log('Testing TMDB API connection...');
        console.log('Using API key:', TMDB_API_KEY.substring(0, 5) + '...');
        
        // Test trending movies endpoint
        console.log('\nTesting trending movies endpoint:');
        const trendingResponse = await axios.get(`https://api.themoviedb.org/3/trending/movie/week`, {
            params: {
                api_key: TMDB_API_KEY,
                language: 'en-US'
            },
            timeout: 10000
        });
        
        if (trendingResponse.data && trendingResponse.data.results) {
            console.log('✅ Successfully fetched trending movies');
            console.log(`Found ${trendingResponse.data.results.length} trending movies`);
            console.log('First movie:', trendingResponse.data.results[0].title);
        } else {
            console.log('❌ Invalid response format from trending endpoint');
            console.log('Response:', JSON.stringify(trendingResponse.data, null, 2));
        }
        
        // Test movie details endpoint
        const movieId = 550; // Fight Club (a known movie ID)
        console.log('\nTesting movie details endpoint:');
        const detailsResponse = await axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
            params: {
                api_key: TMDB_API_KEY,
                language: 'en-US'
            },
            timeout: 10000
        });
        
        if (detailsResponse.data && detailsResponse.data.title) {
            console.log('✅ Successfully fetched movie details');
            console.log('Movie title:', detailsResponse.data.title);
        } else {
            console.log('❌ Invalid response format from details endpoint');
            console.log('Response:', JSON.stringify(detailsResponse.data, null, 2));
        }
        
        // Test movie videos endpoint
        console.log('\nTesting movie videos endpoint:');
        const videosResponse = await axios.get(`https://api.themoviedb.org/3/movie/${movieId}/videos`, {
            params: {
                api_key: TMDB_API_KEY,
                language: 'en-US'
            },
            timeout: 10000
        });
        
        if (videosResponse.data && videosResponse.data.results) {
            console.log('✅ Successfully fetched movie videos');
            console.log(`Found ${videosResponse.data.results.length} videos`);
            if (videosResponse.data.results.length > 0) {
                console.log('First video:', videosResponse.data.results[0].name);
            }
        } else {
            console.log('❌ Invalid response format from videos endpoint');
            console.log('Response:', JSON.stringify(videosResponse.data, null, 2));
        }
        
    } catch (error) {
        console.error('❌ Error testing TMDB API:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        } else if (error.request) {
            console.error('No response received. Network issue?');
        }
    }
}

testTmdbApi(); 