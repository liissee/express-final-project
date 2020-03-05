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
  lists: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RatedMovie"
  }
})

const RatedMovie = mongoose.model("RatedMovie", {
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  userId: {
    type: String
  },
  movieId: {
    type: Number
  },
  movieTitle: {
    type: String
  },
  score: {
    type: Number
  },
  status: {
    type: String
  },
  date: {
    type: Date,
    dagault: Date.now
  }
}
)

// personalMovieLists: {
//   type: Array,
//   default: []
// }
// personalLists: {
//   type: Array,
//   default: [


// const Lists = mongoose.model('Lists', {
//   watched: {
//     type: Array,
//     default: []
//   },
//   willWatch: {
//     type: Array,
//     default: []
//   },
//   rewatch: {
//     type: Array,
//     default: []
//   },
//   noRewatch: {
//     type: Array,
//     default: []
//   },
//   willNotWatch: {
//     type: Array,
//     default: []
//   }
// }
// }




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
    res.json({ userId: user._id, accessToken: user.accessToken })
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

// Secure endpoint, user needs to be logged in to access this.
// app.put('/users/:id', authenticateUser)

// Change rating?
// app.put('/users/:userId', async (req, res) => {
//   const { userId } = req.params
//   const { userId, movieId, movieTitle, score } = req.body
//   const ratedMovie = new RatedMovie({ userId, movieId, movieTitle, score })
//   const saved = await ratedMovie.save()
//   try {
//     await ratedMovie.updateOne({ '_id': userId }, req.body, { accessToken: req.header("Authorization") })
//     res.status(201).json()
//   } catch (err) {
//     res.status(400).json({ message: 'Could not save update', errors: err.errors })
//   }
// })

app.get('/users/:userId', authenticateUser)
app.get('/users/:userId', (req, res) => {
  try {
    res.status(201).json(req.user)
  } catch (err) {
    res.status(400).json({ message: 'could not save user', errors: err.errors })
  }
})

//Test posting score to lists
app.post('/users/:userId', async (req, res) => {
  try {
    const { userId, movieId, movieTitle, score } = req.body
    const ratedMovie = new RatedMovie({ userId, movieId, movieTitle, score })
    const saved = await ratedMovie.save()
    res.status(201).json(saved)
  } catch (err) {
    res.status(400).json({ message: 'Could not rate movie', errors: err.errors })
  }
})

//Get user-specific lists
app.get('/users/:userId/movies', async (req, res) => {
  const userId = req.params.userId
  const { score, status } = req.query

  //Puts score-query and status-query into an object
  const buildScoreStatusQuery = (score, status) => {
    let findScoreStatus = {}
    if (score) {
      findScoreStatus.score = score
    }
    if (status) {
      findScoreStatus.status = status
    }
    return findScoreStatus
  }

  const lists = await RatedMovie.find({ "userId": userId }).find(buildScoreStatusQuery(score, status)).sort({ date: -1 })
  if (lists.length > 0) {
    res.json(lists)
  } else {
    res.status(404).json({ message: 'No movies rated yet' })
  }
})

// app.get('/users/:userId/movies/:score', async (req, res) => {
//   const userId = req.params.userId
//   const score = req.params.score
//   const lists = await RatedMovie.find({ "userId": userId, "score": score }).sort({ date: -1 })
//   if (lists.length > 0) {
//     res.json(lists)
//   } else {
//     res.status(404).json({ message: 'No movies with this rating' })
//   }
// })

// app.get('/users/:userId', (req, res) => {
//   try {
//     const books = await Book.find().populate('author')
//     res.json(books)
//     res.status(201).json(req.user)
//   } catch (err) {
//     res.status(400).json({ message: 'could not save user', errors: err.errors })
//   }
// })


// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})
