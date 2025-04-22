const mongoose=require('mongoose');

const movieSchema=new mongoose.Schema({
    movieId:Number,
    backdropPath:String,
    budget:Number,
    genres:[String],
    genreIds:[Number],
    originalTitle:String,
    overview:String,
    popularity:Number,
    posterPath:String,
    productionCompanies:[String],
    releaseDate:Date,
    revenue:Number,
    runTime:Number,
    status:String,
    title:String,
    watchProviders:[String],
    logos:String,
    downloadLink:String,
    ratings:Number,    
});

const Movie=mongoose.model('Movie',movieSchema);

module.exports=Movie;