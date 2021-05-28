const multer = require('multer');
const sharp = require('sharp');
const User = require('../models/user.model');
const AppError = require('../libs/AppError');
const asyncCatch = require('../libs/asyncCatch');
const filterFields = require('../libs/filterFields');
//const uploadPhoto = require('../libs/uploadPhoto');
const factory = require('./handlerFactory');
const filterQueryList = require('../libs/filterQueryList');
const APIFeatures = require('../libs/apiFeatures');

const multerStorage = multer.memoryStorage();

//Validate image type
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image. Please upload a valid image type', 400));
  }
};

//for module, call upload, use fs to move file from temp dir to correct one
//for now keep all the multer code in the controller

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
});

exports.uploadUserPhoto = upload.single('photo');

exports.resizeUserPhoto = (req, res, next) => {
  if (!req.file) return next();

  req.file.filename = `${req.user.id}.jpeg`;

  sharp(req.file.buffer)
    .resize(500, 500)
    .toFormat('jpeg')
    .jpeg({ quality: 90 })
    .toFile(`public/img/users/${req.file.filename}`);

  next();
};

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
        'Password cannot be updated from this route. Please use /updateMyPassword instead.',
        400
      )
    );
  }

  // Filter all fields but 'name' and 'email'
  const filteredBody = filterFields(
    req.body,
    'name',
    'email',
    'privateFavorites',
    'favorites',
    'bio',
    'interests',
    'tagline'
  );
  if (req.file) filteredBody.photo = req.file.filename;

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

exports.getUserProfile = asyncCatch(async (req, res, next) => {
  const eventFields =
    'id name dateTimeStart dateTimeEnd photo ticketTiers totalBookings';
  const defaultFields =
    'name,photo,createdAt,tagline,bio,interests,favorites,privateFavorites,events';

  //paginate options
  const limit = req.query.paginate ? Number(req.query.paginate.limit || 4) : 4;
  const skip = req.query.paginate
    ? limit * ((req.query.paginate.page || 0) - 1)
    : 0;

  //ensure selected fields are subset of default, or use default
  req.query.fields = req.query.fields
    ? filterQueryList(req.query.fields, defaultFields) || defaultFields
    : defaultFields;

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
      options: {
        skip,
        limit,
        select: eventFields,
      },
    });
  }

  const doc = await queryFeatures.query;

  //remove favorites field if private
  if (doc.privateFavorites) {
    doc.favorites = undefined;
  }
  doc.privateFavorites = undefined;

  res.status(200).json({
    status: 'success',
    data: {
      user: doc,
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
