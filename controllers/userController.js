const User = require('../models/userModel');
const AppError = require('../libs/AppError');
const asyncCatch = require('../libs/asyncCatch');
const filterFields = require('../libs/filterFields');
const factory = require('./handlerFactory');

//Me controllers
exports.getMe = (req, res, next) => {
  req.params.id = req.user.id;
};

exports.updateMe = asyncCatch(async (req, res, next) => {
  // Catch password update attempt and create error
  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError(
        'Password cannot be updated from this route. Please use /updateMyPassword instead.',
        400
      )
    );
  }

  // Filter all fields but 'name' and 'email'
  const filteredBody = filterFields(req.body, 'name', 'email');

  //Update User
  const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
    new: true,
    runValidators: true,
  });

  //Send updated user in response
  res.status(200).json({
    status: 'success',
    data: {
      user: updatedUser,
    },
  });
});

exports.deleteMe = asyncCatch(async (req, res, next) => {
  await User.findByIdAndUpdate(req.user.id, { active: false });

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

//Admin CRUD controllers
exports.createUser = (req, res, next) => {
  next(
    new AppError('Invalid route. Please use /signup to create a new user.', 400)
  );
};
exports.getAllUsers = factory.getAll(User);
exports.getUser = factory.getOne(User);
//disallow password update
exports.updateUser = factory.updateOne(User);
exports.deleteUser = factory.deleteOne(User);
