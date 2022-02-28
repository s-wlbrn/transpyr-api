const authService = require('../services/auth.service');
const userService = require('../services/user.service');
const Email = require('../services/email.service');
const AppError = require('../libs/AppError');
const asyncCatch = require('../libs/asyncCatch');

const createSendToken = async (
  user,
  statusCode,
  req,
  res,
  refreshToken = null
) => {
  if (!user) {
    throw new AppError('Invalid user', 400);
  }

  const token = authService.signToken(user._id);
  const newRefreshToken = await authService.generateRefreshToken(user._id);

  //Revoke old token if provided
  if (refreshToken) {
    await authService.revokeRefreshToken(refreshToken, newRefreshToken);
  }

  const cookieOptions = {
    expires: new Date(Date.now() + 604800000),
    //Only send cookie over HTTPS if in production environment
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    httpOnly: true,
    domain: process.env.NODE_ENV !== 'development' && 'transpyr.app',
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
  const { name, email, password, passwordConfirm } = req.body;
  const newUser = await userService.createUser(
    name,
    email,
    password,
    passwordConfirm
  );

  //Send welcome email
  const url = `${req.protocol}://${process.env.FRONTEND_HOST}/events/create`;
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
  const user = await userService.getUser({ email }, { password: true });
  if (!user || !(await user.isCorrectPassword(password, user.password))) {
    return next(
      new AppError(
        'Either the specified password is incorrect, or a user with this email address does not exist. Please try again.',
        401
      )
    );
  }

  //handle inactive user
  if (!user.active) {
    return next(
      new AppError(
        'The account associated with this email address has been deactivated',
        403
      )
    );
  }

  //send tokens
  await createSendToken(user, 200, req, res);
});

exports.forgotPassword = async (req, res, next) => {
  const { email } = req.body;
  if (!email)
    return next(new AppError('Please provide an email address.', 400));

  //get user from email posted
  const user = await userService.getUser({ email });

  if (!user || !user.active) {
    return next(
      new AppError('This email address does not belong to an active user.', 404)
    );
  }

  //generate random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  //email user
  try {
    const resetUrl = `${req.protocol}://${process.env.FRONTEND_HOST}/users/forgot-password/${resetToken}`;
    await new Email(user, resetUrl).sendPasswordReset();
  } catch (err) {
    await authService.revertPasswordReset(user);

    return next(
      new AppError(
        'There was an error sending the email. Try again later.',
        500
      )
    );
  }

  res.status(200).json({
    status: 'success',
    message: 'Email sent!',
  });
};

exports.resetPassword = asyncCatch(async (req, res, next) => {
  //get user from token
  const hashedToken = authService.hashPasswordResetToken(req.params.token);

  const user = await userService.getUser({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  //handle invalid token
  if (!user) {
    return next(new AppError('Token is invalid or has expired.', 400));
  }

  //reset password
  await authService.resetUserPassword(
    user,
    req.body.password,
    req.body.passwordConfirm
  );

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

  if (!newPassword) {
    return next(new AppError('Please enter your new password.', 400));
  }

  if (!newPasswordConfirm) {
    return next(new AppError('Please confirm your new password.', 400));
  }

  //get user
  const user = await userService.getUser(
    { _id: req.user._id },
    { password: true }
  );

  //check password in body
  if (!(await user.isCorrectPassword(password, user.password))) {
    return next(new AppError('The password entered is incorrect.', 400));
  }

  //update password
  await authService.updateUserPassword(user, newPassword, newPasswordConfirm);

  next();
});

exports.refreshToken = asyncCatch(async (req, res, next) => {
  const token = req.cookies.refreshToken;

  if (!token) return next(new AppError('Refresh token is required.', 400));

  const refreshToken = await authService.getRefreshToken(
    { token },
    { user: true }
  );
  const { user } = refreshToken;

  //Send refresh token in cookie, jwt and user in res
  await createSendToken(user, 200, req, res, refreshToken);
});

exports.revokeToken = asyncCatch(async (req, res, next) => {
  const token = req.cookies.refreshToken;

  if (!token) return next(new AppError('Token is required', 400));

  //get token
  const refreshTokenToRevoke = await authService.getRefreshToken({
    token,
    revoked: undefined,
    expires: {
      $gt: Date.now(),
    },
  });

  //handle invalid token
  if (!refreshTokenToRevoke) return next(new AppError('Invalid token.', 400));

  //handle user is not admin and does not own token
  if (
    String(refreshTokenToRevoke.user) !== String(req.user.id) &&
    req.user.role !== 'admin'
  )
    return next(new AppError('Unauthorized', 403));

  //revoke token
  await authService.revokeRefreshToken(refreshTokenToRevoke);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.getAttachUser = asyncCatch(async (req, res, next) => {
  const token = authService.extractToken(req.headers);
  if (!token) {
    return next();
  }

  //catch and ignore error from decode so invalid token defaults to no user
  let decodedUser;
  try {
    decodedUser = await authService.decodeToken(token);
  } catch (err) {
    return next();
  }

  //attach user info to req
  req.user = decodedUser;
  next();
});

exports.protectRoute = asyncCatch(async (req, res, next) => {
  //check for JWT
  const token = authService.extractToken(req.headers);

  if (!token) {
    return next(new AppError('You are not logged in.', 401));
  }

  const decodedUser = await authService.decodeToken(token);

  //attach user info to req
  req.user = decodedUser;
  next();
});

exports.authorizeRole = (...roles) => {
  return (req, res, next) => {
    const { user } = req;
    if (!user || !roles.includes(user.role)) {
      return next(new AppError('Unauthorized.', 403));
    }

    next();
  };
};
