const AppError = require('../libs/AppError');

//JSON Web Token errors
const handleErrorJWT = () =>
  new AppError('Invalid login token. Please log in again.', 401);
const handleExpiredJWT = () =>
  new AppError('Expired login token. Please log in again.', 401);

//MongoDB errors
const handleCastErrorDB = (err) => {
  const { path, value } = err;
  const message = `Invalid ${path}: ${value}`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err) => {
  const key = Object.keys(err.keyValue)[0];
  const value = Object.values(err.keyValue)[0];
  const message = `Duplicate ${key} value: ${value}. Please provide a unique ${key} value.`;
  return new AppError(message, 400);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Invalid input data. ${errors.join(' ')}`;
  return new AppError(message, 400);
};

//Error data for production and development environments
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack,
  });
};

const sendErrorProduction = (err, res) => {
  //Operational errors
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      code: err.statusCode,
      message: err.message,
    });
  } else {
    console.log('ERROR!', err);
    res.status(500).json({
      status: 'error',
      code: err.statusCode,
      message: 'Something went wrong.',
    });
  }
};

//Global error handler
module.exports = (err, req, res, next) => {
  //default to 500 if no status code
  err.statusCode = err.statusCode || 500;
  //default to 'error' if no status
  err.status = err.status || 'error';

  let error = { ...err };
  //workaround for spread operator not including message property
  error.message = err.message;

  //Handle JWT errors
  if (error.name === 'JsonWebTokenError') error = handleErrorJWT();
  if (error.name === 'TokenExpiredError') error = handleExpiredJWT();

  //Handle MongoDB errors
  if (err.name === 'CastError') error = handleCastErrorDB(error);
  if (err.name === 'ValidationError') error = handleValidationErrorDB(error);
  //no name available for DuplicateFields error
  if (err.code === 11000) error = handleDuplicateFieldsDB(error);

  //Send error corresponding to NODE_ENV
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, res);
  } else if (process.env.NODE_ENV === 'production') {
    sendErrorProduction(error, res);
  }
};
