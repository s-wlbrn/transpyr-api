const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const asyncCatch = require('../libs/asyncCatch');
const AppError = require('../libs/AppError');
const Email = require('../libs/email');
const User = require('../models/user.model');
const RefreshToken = require('../models/refresh-token.model');

const extractToken = (headers) => {
  let token;
  if (headers.authorization && headers.authorization.startsWith('Bearer')) {
    token = headers.authorization.split(' ')[1];
  }

  return token;
};

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const decodeToken = async (token) => {
  //verify token
  const decodedToken = await promisify(jwt.verify)(
    token,
    process.env.JWT_SECRET
  );

  //try to get user
  const decodedUser = await User.findById(decodedToken.id);

  //check if user is active
  if (!decodedUser) {
    return Promise.reject(
      new AppError(
        'The account associated with this session has been deactivated',
        401
      )
    );
  }
  //check if password was changed after JWT issued
  if (decodedUser.changedPasswordAfter(decodedToken.iat)) {
    return Promise.reject(
      new AppError(
        'The password of the account associated with this session was changed. Please log in again.',
        401
      )
    );
  }

  return decodedUser;
};

const generateRefreshToken = (userId) => {
  return new RefreshToken({
    user: userId,
    expires: new Date(Date.now() + 604800000),
  });
};

const getRefreshToken = async (token) => {
  const refreshToken = await RefreshToken.findOne({ token }).populate('user');
  if (!refreshToken || !refreshToken.isActive)
    throw new AppError('Invalid token.', 401);
  return refreshToken;
};

const createSendToken = async (
  user,
  statusCode,
  req,
  res,
  refreshToken = null
) => {
  const token = signToken(user._id);
  const newRefreshToken = generateRefreshToken(user._id);
  await newRefreshToken.save();

  //Revoke old token if provided
  if (refreshToken) {
    refreshToken.revoked = Date.now();
    refreshToken.replacedByToken = newRefreshToken;
    await refreshToken.save();
  }

  const cookieOptions = {
    expires: new Date(Date.now() + 604800000),
    //Only send cookie over HTTPS if in production environment
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    httpOnly: true,
    sameSite: 'none',
  };

  //configure cookie
  res.cookie('refreshToken', newRefreshToken.token, cookieOptions);

  res.status(statusCode).json({
    status: 'success',
    token,
    expiresIn: process.env.JWT_EXPIRES_IN,
    data: {
      user: { ...user._doc, password: undefined },
    },
  });
};

exports.signup = asyncCatch(async (req, res, next) => {
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
  });
  const url = `${req.protocol}://${process.env.FRONTEND_HOST}/events/create-event`;
  await new Email(newUser, url).sendWelcome();
  await createSendToken(newUser, 201, req, res);
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
    return next(
      new AppError(
        'Either the specified password is incorrect, or a user with this email address does not exist. Please try again.',
        400
      )
    );
  }

  //send tokens
  await createSendToken(user, 200, req, res);
});

exports.forgotPassword = async (req, res, next) => {
  //get user from email posted
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    return next(
      new AppError('This email address does not belong to a user.', 404)
    );
  }

  //generate random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  //email to user
  const resetURL = `${req.protocol}://${process.env.FRONTEND_HOST}/users/forgot-password/${resetToken}`;
  try {
    await new Email(user, resetURL).sendPasswordReset();

    res.status(200).json({
      status: 'success',
      message: 'Email sent!',
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError(
        'There was an error sending the email. Try again later.',
        500
      )
    );
  }
};

exports.resetPassword = asyncCatch(async (req, res, next) => {
  //get user from token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  //if token has not expired, user exists, set new password
  if (!user) {
    return next(new AppError('Token is invalid or has expired.', 400));
  }
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;

  await user.save();

  res.status(200).json({
    status: 'success',
    message: 'Password changed successfully.',
  });
});

exports.updatePassword = asyncCatch(async (req, res, next) => {
  const { password, newPassword, newPasswordConfirm } = req.body;

  if (!password) {
    return next(new AppError('Please enter your current password.', 400));
  }

  //get user
  const user = await User.findById(req.user._id).select('+password');

  //check password in body
  if (!(await user.isCorrectPassword(password, user.password))) {
    return next(new AppError('The password entered is incorrect.', 400));
  }

  //update password
  user.password = newPassword;
  user.passwordConfirm = newPasswordConfirm;
  await user.save();

  next();
});

exports.refreshToken = asyncCatch(async (req, res, next) => {
  console.log(req.cookies);
  const token = req.cookies.refreshToken;
  const refreshToken = await getRefreshToken(token);
  const { user } = refreshToken;

  //Send new token in cookie, new jwt and user in res
  await createSendToken(user, 200, req, res, refreshToken);
});

exports.revokeToken = asyncCatch(async (req, res, next) => {
  const token = req.body.token || req.cookies.refreshToken;

  if (!token) return next(new AppError('Token is required', 400));

  //get token
  const refreshTokenToRevoke = await RefreshToken.findOne({ token });

  //handle invalid token
  if (!refreshTokenToRevoke) return next(new AppError('Invalid token.', 400));

  //handle user is not admin and does not own token
  if (!refreshTokenToRevoke.user === req.user.id && !req.user.role === 'admin')
    return next(new AppError('Unauthorized', 401));

  //revoke token
  refreshTokenToRevoke.revoked = Date.now();
  await refreshTokenToRevoke.save();

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.getAttachUser = asyncCatch(async (req, res, next) => {
  const token = extractToken(req.headers);
  if (!token) {
    return next();
  }
  //catch and ignore error from decode so invalid token defaults to no user
  let decodedUser;
  try {
    decodedUser = await decodeToken(token);
  } catch (err) {
    return next();
  }
  //attach user info to req
  req.user = decodedUser;
  next();
});

exports.protectRoute = asyncCatch(async (req, res, next) => {
  //check for JWT
  const token = extractToken(req.headers);

  if (!token) {
    return next(new AppError('You are not logged in.', 401));
  }

  const decodedUser = await decodeToken(token);

  //attach user info to req
  req.user = decodedUser;
  next();
});

exports.authorizeRole = (roles) => {
  if (typeof roles === 'string') {
    roles = [roles];
  }

  return (req, res, next) => {
    const { user } = req;
    if (!user || !roles.includes(user.role)) {
      return next(new AppError('Unauthorized.', 403));
    }
    next();
  };
};

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action.', 403)
      );
    }
  };
};
