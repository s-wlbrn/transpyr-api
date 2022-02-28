const sharp = require('sharp');
const User = require('../models/user.model');
const AppError = require('../libs/AppError');
const asyncCatch = require('../libs/asyncCatch');
const filterFields = require('../libs/filterFields');
const factory = require('./handlerFactory');
const filterQueryList = require('../libs/filterQueryList');
const APIFeatures = require('../libs/apiFeatures');
const multerUpload = require('../libs/multerUpload');
const s3Upload = require('../libs/s3Upload');

exports.uploadUserPhoto = multerUpload.single('photo');

exports.processUserPhoto = asyncCatch(async (req, res, next) => {
  if (!req.file) return next();

  req.file.filename = `${req.user.id}.jpeg`;
  //resize and format image
  const data = await sharp(req.file.buffer)
    .resize(500, 500)
    .toFormat('jpeg')
    .jpeg({ quality: 90 })
    .toBuffer();
  //upload to s3
  await s3Upload(data, 'users', req.file.filename);
  //attach filename to req.body
  req.body.photo = req.file.filename;
  next();
});

//Me controllers
exports.getMe = (req, res, next) => {
  req.params.id = req.user.id;
  next();
};

exports.updateMe = asyncCatch(async (req, res, next) => {
  // Catch password update attempt and create error
  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError(
        'Password cannot be updated from this route. Please use /updatePassword instead.',
        400
      )
    );
  }

  const filteredBody = filterFields(
    req.body,
    'name',
    'email',
    'privateFavorites',
    'photo',
    'favorites',
    'bio',
    'interests',
    'tagline'
  );
  if (!req.file) delete filteredBody.photo;

  //Update User
  const updatedUser = await User.findByIdAndUpdate(
    req.params.id,
    filteredBody,
    {
      new: true,
      runValidators: true,
    }
  );

  //Send updated user in response
  res.status(200).json({
    status: 'success',
    data: {
      user: updatedUser,
    },
  });
});

exports.getUserProfile = asyncCatch(async (req, res, next) => {
  const eventFields =
    'id name dateTimeStart dateTimeEnd photo ticketTiers totalBookings';
  const defaultFields =
    'name,photo,createdAt,tagline,bio,interests,favorites,privateFavorites,events';

  //paginate options
  let pagination = {};
  //conditionally parse JSON
  if (req.query.paginate) {
    pagination =
      typeof req.query.paginate === 'string'
        ? JSON.parse(req.query.paginate)
        : req.query.paginate;
  }
  const limit = pagination.limit ? Number(pagination.limit) : 4;
  const skip = pagination.page ? limit * (pagination.page - 1) : 0;

  //ensure selected fields are subset of default, or use default
  req.query.fields = req.query.fields
    ? filterQueryList(req.query.fields, defaultFields) || defaultFields
    : defaultFields;
  req.query.fields += ',active';

  //select fields
  const queryFeatures = new APIFeatures(
    User.findById(req.params.id),
    req.query
  ).limit();

  //populate selected fields
  const fieldsArray = req.query.fields.split(',');
  if (fieldsArray.includes('favorites')) {
    queryFeatures.query.populate({
      path: 'favorites',
      match: { published: true },
      options: {
        skip,
        limit,
        select: eventFields,
      },
    });
  }
  if (fieldsArray.includes('events')) {
    queryFeatures.query.populate({
      path: 'events',
      match: { published: true },
      options: {
        skip,
        limit,
        select: eventFields,
      },
    });
  }

  const user = await queryFeatures.query;

  if (!user || !user.active) {
    return next(new AppError('No active user found with specified ID', 404));
  }

  //remove favorites field if private
  if (user.privateFavorites) {
    user.favorites = undefined;
  }
  user.privateFavorites = undefined;

  res.status(200).json({
    status: 'success',
    data: {
      user,
    },
  });
});

exports.deactivateMe = asyncCatch(async (req, res, next) => {
  await User.findByIdAndUpdate(req.user.id, { active: false });

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.updateUserAsAdmin = asyncCatch(async (req, res, next) => {
  // Catch password update attempt and create error
  if (req.body.password || req.body.passwordConfirm) {
    return next(new AppError('Admins cannot update user passwords.', 400));
  }

  const filteredBody = filterFields(
    req.body,
    'name',
    'email',
    'privateFavorites',
    'photo',
    'favorites',
    'bio',
    'interests',
    'tagline',
    'active'
  );
  req.body = filteredBody;
  next();
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
