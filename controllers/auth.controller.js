const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const asyncCatch = require('../libs/asyncCatch');
const AppError = require('../libs/AppError');
const User = require('../models/user.model');
const RefreshToken = require('../models/refresh-token.model');

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const generateRefreshToken = (userId) => {
  return new RefreshToken({
    user: userId,
    expires: new Date(Date.now() + 604800000),
  });
};

const createSendToken = asyncCatch(async (user, statusCode, res) => {
  const token = signToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  await refreshToken.save();

  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN + 604800000
    ),
    secure: false,
    httpOnly: true,
  };

  //Only send cookie over HTTPS if in production environment
  if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;

  //configure cookie
  res.cookie('refreshToken', refreshToken.token, cookieOptions);

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user: { ...user._doc, password: undefined },
    },
  });
});

exports.signup = asyncCatch(async (req, res, next) => {
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    //role?
  });

  await createSendToken(newUser, 201, res);
});

exports.signin = asyncCatch(async (req, res, next) => {
  const { email, password } = req.body;

  //check if both email and password are entered
  if (!email || !password) {
    return next(new AppError('Please provide an email and password', 400));
  }
  //check if user exists and password is correct
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.isCorrectPassword(password, user.password))) {
    next(
      new AppError(
        'Either the specified password is incorrect, or a user with this email address does not exist. Please try again.',
        400
      )
    );
  }

  //send token
  await createSendToken(user, 200, res);
});

exports.protectRoute = asyncCatch(async (req, res, next) => {
  //check for JWT
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    return next(new AppError('You are not logged in.', 401));
  }

  //verify token
  const decodedToken = await promisify(jwt.verify)(
    token,
    process.env.JWT_SECRET
  );

  //try to get user
  const decodedUser = await User.findById(decodedToken.id);

  //check if user is active
  if (!decodedUser) {
    return next(
      new AppError(
        'The account associated with this session has been deactivated',
        401
      )
    );
  }

  //check if password was changed after JWT issued
  if (decodedUser.changedPasswordAfter(decodedToken.iat)) {
    return next(
      new AppError(
        'The password of the account associated with this session was changed. Please log in again.',
        401
      )
    );
  }

  //attach user info to req
  req.user = decodedUser;
  next();
});
