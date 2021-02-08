const multer = require('multer');
const slugify = require('slugify');
const AppError = require('../libs/AppError');
const Event = require('../models/eventModel');
const factory = require('./handlerFactory');

//Multer storage configuration
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/img/events');
  },
  filename: (req, file, cb) => {
    const ext = file.mimetype.split('/')[1];
    //get event id
    cb(
      null,
      `event-${slugify(req.body.name, { lower: true })}-${Date.now()}.${ext}`
    );
  },
});

//Validate image type
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image. Please upload a valid image type', 400));
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
});

exports.uploadEventPhoto = upload.single('photo');

exports.getAllEvents = factory.getAll(Event);
//populate?
exports.getEvent = factory.getOne(Event);
exports.createEvent = factory.createOne(Event);
exports.updateEvent = factory.updateOne(Event);
exports.deleteEvent = factory.deleteOne(Event);
