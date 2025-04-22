# Netflix Clone

A full-stack web application that replicates the core functionality of Netflix, allowing users to browse, search, and stream movies and TV shows. The application includes user authentication, premium subscriptions, and content management features.

## Features

- **User Authentication**: Register, login, and manage user accounts
- **Content Streaming**: Stream movies and TV shows directly in the browser
- **Content Discovery**: Browse movies and TV shows by genre, trending, and featured categories
- **Search Functionality**: Search for content by title or description
- **User Profiles**: Track watch history and create watchlists
- **Premium Content**: Subscription-based access to premium content
- **Admin Dashboard**: Manage content, users, and application settings
- **Responsive Design**: Optimized for both desktop and mobile viewing

## Tech Stack

### Backend
- **Node.js** with **Express.js** for the server
- **MongoDB** with **Mongoose** for the database
- **Passport.js** for authentication
- **Handlebars (HBS)** for server-side templating
- **SFTP** for remote video storage integration

### Frontend
- **HTML/CSS/JavaScript**
- **Tailwind CSS** for styling
- **Font Awesome** for icons

## Project Structure

- `Backend/`: Contains the Node.js/Express.js server code
  - `models/`: Database schemas
  - `routes/`: API endpoints
  - `views/`: Handlebars templates
  - `middleware/`: Authentication and other middleware
  - `public/`: Static assets
  - `services/`: Business logic
  - `config/`: Configuration files

## Prerequisites

- Node.js (v14 or higher)
- MongoDB
- Docker (optional, for SFTP server setup)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/Netflix-Clone.git
   cd Netflix-Clone
   ```

2. Install backend dependencies:
   ```bash
   cd Backend
   npm install
   ```

3. Configure environment variables:
   Create a `.env` file in the Backend directory with the following variables:
   ```
   PORT=5000
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<dbname>
   JWT_SECRET=your_secret_key
   ```

4. Set up SFTP server for video storage (optional):
   ```bash
   # Start the Docker SFTP server
   docker-compose up -d
   ```
   
   See `ubuntu-server-setup.md` for detailed instructions on setting up video storage.

5. Start the backend server:
   ```bash
   npm start
   ```

6. Access the application:
   Open your browser and navigate to `http://localhost:5000`

## Docker Deployment

The application includes Docker configuration for easy deployment:

```bash
# Start the application with Docker Compose
docker-compose up -d
```

## User Types

1. **Regular Users**: Can browse and watch free content
2. **Premium Users**: Can access all content including premium movies and shows
3. **Admin Users**: Can manage content, users, and application settings

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [TMDB API](https://www.themoviedb.org/documentation/api) for movie and TV show data
- [Netflix](https://www.netflix.com) for design inspiration 