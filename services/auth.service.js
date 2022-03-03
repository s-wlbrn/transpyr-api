const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const crypto = require('crypto');
const User = require('../models/user.model');
const RefreshToken = require('../models/refresh-token.model');
const AppError = require('../libs/AppError');
const Email = require('./email.service');

//Emails
exports.sendWelcomeEmail = async (newUser, url) => {
  await new Email(newUser, url).sendWelcome();
};

exports.sendPasswordResetEmail = async (user, url) => {
  await new Email(user, url).sendPasswordReset();
};

//JWT
exports.extractToken = (headers) => {
  let token;
  if (headers.authorization && headers.authorization.startsWith('Bearer')) {
    token = headers.authorization.split(' ')[1];
  }

  return token;
};

exports.signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

exports.decodeToken = async (token) => {
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

//Refresh Token
exports.generateRefreshToken = async (userId) => {
  const refreshToken = new RefreshToken({
    user: userId,
    expires: new Date(Date.now() + 604800000),
  });
  await refreshToken.save();

  return refreshToken;
};

exports.getRefreshToken = async (query, options = {}) => {
  const refreshTokenQuery = RefreshToken.findOne(query);

  if (options.user) refreshTokenQuery.populate('user');

  const refreshToken = await refreshTokenQuery;

  if (!refreshToken || !refreshToken.isActive)
    throw new AppError('Invalid token.', 401);

  return refreshToken;
};

exports.revokeRefreshToken = async (refreshToken, newRefreshToken) => {
  refreshToken.revoke(newRefreshToken);
  await refreshToken.save();

  return refreshToken;
};

//Update Password
const updateUserPassword = async (user, password, passwordConfirm) => {
  user.updatePassword(password, passwordConfirm);
  await user.save();

  return user;
};
exports.updateUserPassword = updateUserPassword;

//Password Reset
exports.revertPasswordReset = async (user) => {
  user.clearPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  return user;
};

exports.hashPasswordResetToken = (token) => {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  return hashedToken;
};

exports.resetUserPassword = async (user, password, passwordConfirm) => {
  user.clearPasswordResetToken();

  await updateUserPassword(user, password, passwordConfirm);
};
