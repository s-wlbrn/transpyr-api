const multer = require('multer');
const sharp = require('sharp');
const Event = require('../models/event.model');
//const uploadPhoto = require('../libs/uploadPhoto');
const factory = require('./handlerFactory');
const AppError = require('../libs/AppError');
const asyncCatch = require('../libs/asyncCatch');
const filterFields = require('../libs/filterFields');

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

exports.convertEventPhotoJpeg = (req, res, next) => {
  if (!req.file) return next();

  req.file.filename = `${req.params.id}.jpeg`;
  sharp(req.file.buffer)
    .toFormat('jpeg')
    .jpeg({ quality: 90 })
    .toFile(`public/img/events/${req.file.filename}`);

  next();
};

exports.attachEventOrganizer = (req, res, next) => {
  req.body.organizer = req.user._id;
  next();
};

exports.getAndAuthorizeEvent = asyncCatch(async (req, res, next) => {
  const doc = await Event.findById(req.params.id);

  if (!doc) {
    return next(new AppError('Event not found.', 404));
  }

  if (String(doc.organizer) !== String(req.user._id)) {
    return next(new AppError('Only the organizer may edit this event.', 403));
  }

  req.event = doc;
  next();
});

exports.findEventAndUpdate = asyncCatch(async (req, res, next) => {
  const filteredBody = filterFields(
    req.body,
    'name',
    'type',
    'category',
    'description',
    'summary',
    'ticketTiers',
    'dateTimeStart',
    'dateTimeEnd',
    'address',
    'location',
    'totalCapacity'
  );

  Object.assign(req.event, filteredBody);
  await req.event.save();

  res.status(200).json({
    status: 'success',
  });
});

exports.publishEvent = asyncCatch(async (req, res, next) => {
  req.body = filterFields(req.body, 'feePolicy', 'refundPolicy');

  if (!req.body.feePolicy) {
    next(
      new AppError('An event cannot be published without a fee policy.', 400)
    );
  }

  req.body.published = true;
  next();
});

exports.uploadEventPhoto = upload.single('photo');

exports.getAllEvents = factory.getAll(Event);
exports.getEvent = factory.getOne(Event);
exports.createEvent = factory.createOne(Event);
exports.updateEvent = factory.updateOne(Event);
exports.deleteEvent = factory.deleteOne(Event);
