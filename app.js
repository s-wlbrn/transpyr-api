const express = require('express');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cors = require('cors');

//import custom error class
const AppError = require('./libs/AppError');

//import global error handling middleware
const globalErrorHandler = require('./controllers/error.controller');

//import routers
const eventRouter = require('./routes/eventRoutes');
const userRouter = require('./routes/userRoutes');

//create app
const app = express();

//Global Middleware

//Serve static files
app.use('/static', express.static('public'));

//Enable CORS
app.use(cors());

//// HTTP security headers
app.use(helmet());

//// Logging with 'morgan' for dev environment
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

//// Rate limiting
const limiter = rateLimit({
  max: 150,
  windowMS: 3600000,
  message: 'Too many requests. Try again in one hour.',
});
app.use('/api', limiter);

//// Express body parser
app.use(express.json({ limit: '5mb' }));

//// Data sanitization
app.use(mongoSanitize());

//// Prevent parameter pollution with 'hpp'
app.use(hpp());

//Mount routes
app.use('/api/events', eventRouter);
app.use('/api/users', userRouter);

//Catch requests to invalid routes
app.all('*', (req, res, next) => {
  next(new AppError(`${req.originalUrl} is not found.`, 404));
});

// Mount global error handler
app.use(globalErrorHandler);

module.exports = app;
