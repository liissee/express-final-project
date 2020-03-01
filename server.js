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
  personalMovieLists: {
    type: Array,
    default: []
  }
  // personalLists: {
  //   type: Array,
  //   default: [
  //     watched: [Object],
  //     willWatch: [Object],
  //     rewatch: [Object],
  //     noRewatch: [Object],
  //     willNotWatch: [Object]
  //   ]
  // }
  // personalList: {
  //   type: Array,
  //   default: [[watched]]
  // },
  // watched: {
  //   type: Array,
  //   default: []
  // }
})
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

// moviesWatched - should it be an array with objects or should we split it up more?
// For example, something like:
//   moviesWatched = [
//   id: String,
//   title: String,
//   watched: Boolean,
//   rating: Number,
// 
// ]



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
    const { name, email, password } = req.body
    const user = new User({ name, email, password: bcrypt.hashSync(password) })
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

// app.get('/profiles', authenticateUser)
// //This will only be shown if the next()-function is called from the middleware
// app.get('/profiles', (req, res) => {
//   res.json({ message: 'Successfully signed in!})
// })

app.get('/secrets', authenticateUser)
//This will only be shown if the next()-function is called from the middleware
app.get('/secrets', (req, res) => {
  res.json({ secret: 'This is a super secret message' }) //what is the difference: res.json and res.send? 
})

// Secure endpoint, user needs to be logged in to access this.
app.get('/users/:id', authenticateUser)
app.get('/users/:id', (req, res) => {
  try {
    res.status(201).json(req.user)
  } catch (err) {
    res.status(400).json({ message: 'could not save user', errors: err.errors })
  }
})

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})
