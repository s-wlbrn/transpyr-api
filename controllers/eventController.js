const multer = require('multer');
const Event = require('../models/eventModel');
//const uploadPhoto = require('../libs/uploadPhoto');
const factory = require('./handlerFactory');
const AppError = require('../libs/AppError');

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
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'public/img/events');
    },
    filename: (req, file, cb) => {
      const ext = file.mimetype.split('/')[1];
      cb(null, `${req.params.id}-${Date.now()}.${ext}`);
    },
  }),
  fileFilter: multerFilter,
});

exports.uploadEventPhoto = upload.single('photo');

exports.getAllEvents = factory.getAll(Event);
//populate?
exports.getEvent = factory.getOne(Event);
exports.createEvent = factory.createOne(Event);
exports.updateEvent = factory.updateOne(Event);
exports.deleteEvent = factory.deleteOne(Event);
