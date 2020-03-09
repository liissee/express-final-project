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

// models
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
  }
})
const RatedMovie = mongoose.model('RatedMovie', {
  reviews: [
    {
      reviewer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      rating: {
        type: Number
      },
      watchStatus: {
        type: String
      }
    }
  ],
  movieId: {
    type: Number
  },
  movieTitle: {
    type: String
  },
  date: {
    type: Date,
    default: Date.now
  }
})





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


app.get('/users/:userId', authenticateUser)
app.get('/users/:userId', (req, res) => {
  try {
    res.status(201).json(req.user)
  } catch (err) {
    res.status(400).json({ message: 'could not save user', errors: err.errors })
  }
})

//Test posting rating to lists. JENNIES
app.put('/users/:userId', async (req, res) => {
  try {
    const userId = req.params.userId
    const { movieId, movieTitle, rating, watchStatus } = req.body
    const user = await User.findOne({ _id: userId }) // get the whole user from userId
    const savedMovie = await RatedMovie.findOne({ movieId }) // check if movie exists already
    if (savedMovie) {
      console.log('there is a saved movie!')
      if (
        savedMovie.reviews.find(
          m => m.reviewer.toString() === req.params.userId.toString() // dont know whats going on with toString here...
        )
      ) {
        // user has reviewed before and wants to update their review. 
        //TODO: Refactor this into ternary operator!
        if (rating) {
          const updated = await RatedMovie.findOneAndUpdate(
            {
              movieId,
              'reviews.reviewer': userId
            }, // find the correct movie and review
            {
              $set: {
                'reviews.$.rating': rating, // updating rating
                // 'reviews.$.watchStatus': watchStatus //and watchStatus. Right now you need to pass both.
              }
            }
          )

        } else if (watchStatus) {
          const updated = await RatedMovie.findOneAndUpdate(
            {
              movieId,
              'reviews.reviewer': userId
            }, // find the correct movie and review
            {
              $set: {
                // 'reviews.$.rating': rating, // updating rating
                'reviews.$.watchStatus': watchStatus //and watchStatus. Right now you need to pass both.
              }
            }
          )
        }
        res.status(201).json(updated)
      } else {
        // user hasnt reviewd this movie, should be added to the reviews list
        console.log('should add user to reviewers')
        const updated = await RatedMovie.findOneAndUpdate(
          { movieId },
          {
            $push: {
              reviews: {
                reviewer: user,
                rating,
                watchStatus
              }
            }
          },
          { new: true }
        )
        res.status(201).json(updated)
      }
    } else {
      //movie isnt yet added by anyone
      console.log('new movie coming!')
      const ratedMovie = new RatedMovie({
        movieId,
        movieTitle,
        reviews: [{ reviewer: user, rating, watchStatus }]
      })
      const saved = await ratedMovie.save()
      res.status(201).json(saved)
    }
  } catch (err) {
    res
      .status(400)
      .json({ message: 'Could not rate movie', errors: err.errors })
  }
})

// Get a list of all the users
app.get('/users/:userId/otherUser', async (req, res) => {
  let otherUser = await User.find()
  res.json(otherUser)
})


//Get user-specific lists
app.get('/users/:userId/movies', async (req, res) => {
  const userId = req.params.userId
  // const ratedByUser = await RatedMovie.find({ 'reviews.reviewer': userId })
  // find all movies reviewd by user
  // res.json(ratedByUser)

  const { rating, watchStatus } = req.query

  //Puts rating-query and status-query into an object
  // const buildRatingStatusQuery = (rating, watchStatus) => {
  //   let findRatingStatus = {}
  //   if (rating) {
  //     findRatingStatus.rating = rating
  //   }
  //   if (watchStatus) {
  //     findRatingStatus.watchStatus = watchStatus
  //   }
  //   return findRatingStatus
  // }

  const ratedByUser = await RatedMovie.find({ 'reviews.reviewer': userId }).find({ 'reviews.rating': rating, 'reviews.watchStatus': watchStatus }).sort({ date: -1 })
  // const lists = await RatedMovie.find({ user: userId }).find(buildRatingStatusQuery(rating, watchStatus)).sort({ date: -1 })
  if (ratedByUser.length > 0) {
    res.status(201).json(ratedByUser)
  } else {
    res.status(404).json({ message: 'No movies rated yet' })
  }

})

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})
