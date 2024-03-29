const express = require('express');
const { Readable } = require('stream');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const S3Service = require('./services/S3.service');
const asyncCatch = require('./libs/asyncCatch');

//import custom error class
const AppError = require('./libs/AppError');

//import global error handling middleware
const globalErrorHandler = require('./controllers/error.controller');

//import routers
const eventRouter = require('./routes/event.routes');
const userRouter = require('./routes/user.routes');
const bookingRouter = require('./routes/booking.routes');

//booking controller for webhook-checkout
const bookingController = require('./controllers/booking.controller');

//create app
const app = express();

app.enable('trust proxy');

////Global Middleware
//Serve static files
app.use('/static', express.static('public'));

//Enable CORS
app.use(
  cors({
    origin:
      process.env.NODE_ENV === 'production'
        ? `https://${process.env.FRONTEND_HOST}`
        : 'http://localhost:3001',
    credentials: true,
  })
);
app.options('*', cors());

// HTTP security headers
app.use(helmet());

// Logging with 'morgan' for dev environment
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Rate limiting
const limiter = rateLimit({
  max: process.env.RATE_LIMIT_MAX_REQUESTS || 150,
  windowMS: 3600000,
  message: 'Too many requests. Try again in one hour.',
});
app.use('/api', limiter);

//Stripe webhook
app.post(
  '/webhook-checkout',
  express.raw({ type: 'application/json' }),
  bookingController.webhookCheckout
);

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

//Stream image from S3 bucket
app.get(
  '/image/:folder/:id',
  asyncCatch(async (req, res, next) => {
    const { folder, id } = req.params;

    //get file
    const fileBuffer = await S3Service.getImage(folder, id);

    //create stream
    const readStream = new Readable();
    readStream.push(fileBuffer);
    readStream.push(null);

    res.header('Content-Type', 'image/jpeg');
    readStream.pipe(res);
  })
);

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
