const express = require('express');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');

//import custom error class
const AppError = require('./libs/AppError');

//import global error handling middleware
const globalErrorHandler = require('./controllers/error.controller');

//import routers
const eventRouter = require('./routes/event.routes');
const userRouter = require('./routes/user.routes');
const bookingRouter = require('./routes/booking.routes');

//create app
const app = express();

app.enable('trust proxy');

////Global Middleware
//Serve static files
app.use('/static', express.static('public'));

//Enable CORS
app.use(cors());
app.options('*', cors());

// HTTP security headers
app.use(helmet());

// Logging with 'morgan' for dev environment
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Rate limiting
const limiter = rateLimit({
  max: 150,
  windowMS: 3600000,
  message: 'Too many requests. Try again in one hour.',
});
app.use('/api', limiter);

// Express body parser
app.use(express.json({ limit: '5mb' }));

// Express cookie parser
app.use(cookieParser());

// Data sanitization
app.use(mongoSanitize());

// Prevent parameter pollution with 'hpp'
app.use(hpp());

// Compression
app.use(compression());

//Mount routes
app.use('/api/events', eventRouter);
app.use('/api/users', userRouter);
app.use('/api/bookings', bookingRouter);

//Catch requests to invalid routes
app.all('*', (req, res, next) => {
  next(new AppError(`${req.originalUrl} is not found.`, 404));
});

// Mount global error handler
app.use(globalErrorHandler);

module.exports = app;
