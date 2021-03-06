import express from 'express'
import bodyParser from 'body-parser'
import cors from 'cors'
import mongoose from 'mongoose'
import crypto from "crypto"
import bcrypt from 'bcrypt-nodejs'

// Setting up MongoDB database
const mongoUrl = process.env.MONGO_URL || "mongodb://localhost/authMovie"
mongoose.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true })
mongoose.Promise = Promise

const User = mongoose.model('User', {
  name: {
    type: String,
    unique: true,
    required: true,
    minlength: 2,
    maxlength: 20
  },
  email: {
    type: String,
    unique: true,
    required: true
  },
  password: {
    type: String,
    required: true,
    minlength: 5
  },
  accessToken: {
    type: String,
    default: () => crypto.randomBytes(128).toString('hex')
  },
  movies: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "RatedMovie"
  }]
})

const RatedMovie = mongoose.model("RatedMovie", {
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  movieId: {
    type: Number
  },
  movieTitle: {
    type: String
  },
  movieImage: {
    type: String
  },
  rating: {
    type: Number
  },
  watchStatus: {
    type: Boolean,
    default: false
  },
  comments: [{
    comment: String,
    userName: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  // comment: [{
  //   type: String
  // }],
  userName: {
    type: String,
    default: ""
  },
  date: {
    type: Date,
    default: Date.now
  }
}
)


// Defines the port the app will run on. Defaults to 8080, but can be 
// overridden when starting the server. For example: PORT=9000 npm start
const port = process.env.PORT || 8080
const app = express()

// Add middlewares to enable cors and json body parsing
app.use(cors())
app.use(bodyParser.json())

const authenticateUser = async (req, res, next) => {
  const user = await User.findOne({ accessToken: req.header('Authorization') })
  if (user) {
    req.user = user
    next() // Calling the next() function which allows the proteced endpoint to continue execution
  } else {
    res.status(403).json({ message: "You need to login to access this page" })
  }
}


app.get('/', (req, res) => {
  res.send('Hello backend for movie project')
})

// Create user
app.post('/users', async (req, res) => {
  try {
    const { name, email, password, lists } = req.body
    const user = new User({ name, email, password: bcrypt.hashSync(password), lists })
    const saved = await user.save()
    res.status(201).json(saved)
  } catch (err) {
    res.status(400).json({ message: 'Could not create user', errors: err.errors })
  }
})

// Login session
app.post('/sessions', async (req, res) => {
  const user = await User.findOne({ email: req.body.email })
  if (user && bcrypt.compareSync(req.body.password, user.password)) {
    res.json({ name: user.name, userId: user._id, accessToken: user.accessToken })
  } else {
    //Failure because user doesn't exist or encrypted password doesn't match
    res.status(400).json({ notFound: true })
  }
})

// This will only be shown if the next()-function is called from the middleware
app.get('/secrets', authenticateUser)
app.get('/secrets', (req, res) => {
  res.json({ secret: 'This is a super secret message' })
})


app.get('/users/:userId', authenticateUser)
app.get('/users/:userId', (req, res) => {
  try {
    res.status(201).json(req.body.user)
  } catch (err) {
    res.status(400).json({ message: 'could not find user', errors: err.errors })
  }
})

// Updating ratings for a logged-in user
app.put('/users/:userId', async (req, res) => {
  try {
    const { userId, movieId, movieTitle, rating, watchStatus, comment, userName } = req.body
    // If two users have rated the same movie, it will find one of them
    const savedMovie = await RatedMovie.findOne({ userId: req.body.userId, movieId: req.body.movieId })
    // If there is a saved movie, update it. Else add it to database! 
    if (savedMovie) {
      const updated = await RatedMovie.findOneAndUpdate({ userId: req.body.userId, movieId: req.body.movieId }, req.body, { new: true })
      res.status(201).json(updated)
    } else {
      const ratedMovie = new RatedMovie({ userId, movieId, movieTitle, rating, watchStatus, comment, userName })
      const saved = await ratedMovie.save()
      await User.findOneAndUpdate(
        { _id: userId },
        { $push: { movies: saved } }
      )
      res.status(201).json(saved)
    }
  } catch (err) {
    res.status(400).json({ message: 'Could not rate movie', errors: err.errors })
  }
})


// Get a list of all the users 
app.get('/users/:userId/allUsers', async (req, res) => {
  const { name } = req.query
  console.log("search user")
  // Regular expression to make it case insensitive
  const nameRegex = new RegExp(name, "i")
  let otherUser
  try {
    if (name) {
      otherUser = await User.find({ name: nameRegex })
    } else {
      otherUser = await User.find()
    }
    res.status(201).json(otherUser)
  } catch (err) {
    res.status(400).json({ message: 'error', errors: err.errors })
  }
})

// Get a list of another user's rated movies
app.get('/users/:userId/otherUser', async (req, res) => {
  try {
    const name = await User.findOne({ _id: req.params.userId })
    const otherUser = await RatedMovie.find({ userId: req.params.userId })
    res.status(201).json({ otherUser, name: name.name })
  } catch (err) {
    res.status(400).json({ message: 'error', errors: err.errors })
  }
})

// Get user-specific lists with queries "watch" and "rating"
app.get('/users/:userId/movies', async (req, res) => {
  const { rating, watchStatus, movieId, page } = req.query

  // Puts rating-query and watchstatus-query into an object
  const buildRatingStatusQuery = (rating, watchStatus) => {
    let findRatingStatus = {}
    if (rating) {
      findRatingStatus.rating = rating
    }
    if (watchStatus) {
      findRatingStatus.watchStatus = watchStatus
    }
    return findRatingStatus
  }

  const skipResults = (page) => {
    return ((page - 1) * 10)
  }

  if (!movieId) {
    const lists = await RatedMovie.find({ userId: req.params.userId })
      .find(buildRatingStatusQuery(rating, watchStatus))
      .sort({ date: -1 })
      .limit(10)
      .skip(skipResults(page))

    if (lists.length > 0) {
      res.json(lists)
    } else {
      res.status(404).json({ message: 'No movies rated yet' })
    }
  } if (movieId) {
    const ratedMovie = await RatedMovie.findOne({ userId: req.params.userId, movieId: movieId })
    res.json(ratedMovie)
  }
})

// Get movies that match
app.get('/movies/:userId', async (req, res) => {
  let myself = req.params.userId
  let friend = req.query.friend

  let myMovies = await RatedMovie.find({
    watchStatus: true,
    userId: myself
  })
  let friendsMovies = await RatedMovie.find({
    watchStatus: true,
    userId: friend
  })
  let matches = []
  myMovies.map((my, index) => {
    if (friendsMovies.filter(friend => friend.movieTitle === my.movieTitle).length > 0) {
      matches.push(my)
    } else {
      return
    }
  })
  res.status(201).json(matches)
})


// Get comments for one movie by movie id
app.get('/comments/:movieId', async (req, res) => {
  try {
    let movie = await RatedMovie.find({ movieId: req.params.movieId })
    let comments = []
    movie.map((commentedMovie) => (
      comments.push(commentedMovie.comments)
    ))
    let allComments = [].concat.apply([], comments)
    const sortedComments = allComments.sort((a, b) => b.createdAt - a.createdAt)
    res.json(sortedComments)
  } catch (err) {
    res.status(400).json({ message: 'error', errors: err.errors })
  }
})

app.delete("/comments/:movieId", async (req, res) => {
  // const userId = req.body.userId
  const movieId = req.params.movieId
  // const createdAt = req.body.createdAt
  const { userId, createdAt } = req.body

  try {
    //Find a comment for the right movie and the logged in user
    const deletedComment = await RatedMovie.findOneAndUpdate(
      { movieId, userId },
      // { $unset: { comment, userId } }
      { $pull: { comments: { createdAt } } }
    )
    if (deletedComment !== null) {
      res.status(200).json({ message: `Successfully deleted comment` })
    } else {
      res.status(400).json({ errorMessage: "Couldn't delete comment" })
    }
  } catch (err) {
    res.status(400).json({ errorMessage: "Couldn't delete comment", error: err.errors })
    console.log(err)
  }
  console.log("Deleted comment: ", deletedComment)
}
)

app.put('/comments/:movieId', async (req, res) => {
  try {
    const { userId, comment, userName, movieId } = req.body
    const savedMovie = await RatedMovie.findOne({ userId: req.body.userId, movieId: req.body.movieId })

    if (savedMovie === null) {
      const savedMovie = new RatedMovie({ userId, movieId, comment, userName })
      const saved = await savedMovie.save()
      await User.findOneAndUpdate(
        { _id: userId },
        { $push: { movies: saved } }
      )
    }
    const updated = await RatedMovie.findOneAndUpdate({ userId: req.body.userId, movieId: req.body.movieId },
      { $push: { comments: { comment, userName } } },
      { new: true }
    )
    res.status(201).json(updated)
  } catch (err) {
    res.status(400).json({ message: 'Could not rate movie', errors: err.errors })
  }
})

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})