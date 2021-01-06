const User = require('../models/userModel');
const asyncCatch = require('../libs/asyncCatch');
const AppError = require('../libs/AppError');
const factory = require('./handlerFactory');

//Me controllers

//Admin CRUD controllers
exports.createUser = (req, res, next) => {
  next(
    new AppError('Invalid route. Please use /signup to create a new user.', 400)
  );
};
exports.getAllUsers = factory.getAll(User);
//disallow password update
exports.updateUser = factory.updateOne(User);
exports.deleteUser = factory.deleteOne(User);
