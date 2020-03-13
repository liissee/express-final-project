import express from 'express'
import bodyParser from 'body-parser'
import cors from 'cors'
import mongoose from 'mongoose'
import crypto from "crypto"
import bcrypt from 'bcrypt-nodejs'

//Setting up mongoDB database
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
    type: String
  },
  date: {
    type: Date,
    default: Date.now
  }
}
)


// Defines the port the app will run on. Defaults to 8080, but can be 
// overridden when starting the server. For example:
//
//   PORT=9000 npm start
const port = process.env.PORT || 8080
const app = express()

// Add middlewares to enable cors and json body parsing
app.use(cors())
app.use(bodyParser.json())

const authenticateUser = async (req, res, next) => {
  const user = await User.findOne({ accessToken: req.header('Authorization') })
  if (user) {
    req.user = user //what does this mean? 
    next() //when to use next? (calling the next() function which allows the proteced endpoint to continue execution)
  } else {
    res.status(403).json({ message: "You need to login to access this page" })
  }
}
// Start defining your routes here
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
//LOGIN SESSION
app.post('/sessions', async (req, res) => {
  const user = await User.findOne({ email: req.body.email })
  if (user && bcrypt.compareSync(req.body.password, user.password)) {
    res.json({ name: user.name, userId: user._id, accessToken: user.accessToken })
  } else {
    //Failure because user doesn't exist or encrypted password doesn't match
    res.status(400).json({ notFound: true })
  }
})


app.get('/secrets', authenticateUser)
//This will only be shown if the next()-function is called from the middleware
app.get('/secrets', (req, res) => {
  res.json({ secret: 'This is a super secret message' }) //what is the difference: res.json and res.send? 
})


app.get('/users/:userId', authenticateUser)
app.get('/users/:userId', (req, res) => {
  try {
    res.status(201).json(req.body.user)
  } catch (err) {
    res.status(400).json({ message: 'could not find user', errors: err.errors })
  }
})

//Test posting rating to lists
app.put('/users/:userId', async (req, res) => {
  // const userId = req.params.userId
  try {
    const { userId, movieId, movieTitle, rating, watchStatus } = req.body
    // const user = await User.findOne({ _id: userId })

    const savedMovie = await RatedMovie.findOne({ userId: req.body.userId, movieId: req.body.movieId })
    //How to make it find something? If i write something weird here, it should go to "else"
    // let saved = []
    if (savedMovie) {
      console.log(savedMovie)
      const updated = await RatedMovie.findOneAndUpdate({ userId: req.body.userId, movieId: req.body.movieId }, req.body, { new: true })
      res.status(201).json(updated)

    } else {
      const ratedMovie = new RatedMovie({ userId, movieId, movieTitle, rating, watchStatus })
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

// Get a list of all the users. KOLLA SÅ ATT VI INTE FÅR MED PASSWORD OCH ACCESSTOKEN
app.get('/users/:userId/allUsers', async (req, res) => {
  const { name } = req.query

  //Regular expression to make it case insensitive
  // const nameRegex = new RegExp(name, "i")
  let otherUser
  try {
    if (name) {
      otherUser = await User.findOne({ name: req.query.name })
    } else {
      otherUser = await User.find()
    }
    res.status(201).json(otherUser)
  } catch (err) {
    res.status(400).json({ message: 'error', errors: err.errors })
  }


  // if (name) {
  //   const person = await User.find({ name: req.query.name })
  //   if (person.length > 0) {
  //     res.json(person)
  //   }
  // } else {
  //   const otherUser = await User.find()
  //   res.json(otherUser)
  // }


})


//   const lists = await RatedMovie.find({ userId: req.params.userId }).find(buildRatingStatusQuery(rating, watchStatus)).sort({ date: -1 })
//   if (lists.length > 0) {
//     res.json(lists)
//   } else {
//     res.status(404).json({ message: 'No movies rated yet' })
//   }

// Get a list of one user
app.get('/users/:userId/otherUser', async (req, res) => {
  try {
    const name = await User.findOne({ _id: req.params.userId })
    const otherUser = await RatedMovie.find({ userId: req.params.userId })
    // .populate('userId')
    res.status(201).json({ otherUser, name: name.name })
  } catch (err) {
    res.status(400).json({ message: 'error', errors: err.errors })
  }
})

//Get user-specific lists with queries "watch" or "no", and "rating"
app.get('/users/:userId/movies', async (req, res) => {
  const { rating, watchStatus } = req.query

  //Puts rating-query and status-query into an object
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

  const lists = await RatedMovie.find({ userId: req.params.userId }).find(buildRatingStatusQuery(rating, watchStatus)).sort({ date: -1 })
  if (lists.length > 0) {
    res.json(lists)
  } else {
    res.status(404).json({ message: 'No movies rated yet' })
  }
})

//GET MOVIES THAT MATCH. http://localhost:8080/movies/5e6651a2564d8b0290c09380?friend=5e6642c587fd9a762bed45d1
app.get('/movies/:userId', async (req, res) => {
  let myself = req.params.userId
  let friend = req.query.friend

  let myMovies = await RatedMovie.find({
    watchStatus: "watch",
    userId: myself
  })
  let friendsMovies = await RatedMovie.find({
    watchStatus: "watch",
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


// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})
