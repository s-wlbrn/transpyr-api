const multer = require('multer');
const sharp = require('sharp');
const Event = require('../models/event.model');
const Booking = require('../models/booking.model');
//const uploadPhoto = require('../libs/uploadPhoto');
const factory = require('./handlerFactory');
const AppError = require('../libs/AppError');
const asyncCatch = require('../libs/asyncCatch');
const filterFields = require('../libs/filterFields');
const APIFeatures = require('../libs/apiFeatures');

//Multer config
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

const cancelAllBookings = asyncCatch(async (matchKey, matchValue) => {
  const ticketBookings = await Booking.find({ [matchKey]: matchValue });
  await ticketBookings.forEach(async (booking) => {
    booking.active = false;
    await booking.save();
  });
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

exports.cancelEvent = asyncCatch(async (req, res, next) => {
  req.event.canceled = true;
  //refund logic would go here
  await req.event.save();
  await cancelAllBookings('event', req.event.id);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.cancelTicket = asyncCatch(async (req, res, next) => {
  if (!req.params.ticketId)
    return next(new AppError('Please provide a ticket ID', 400));

  const ticketIndex = req.event.ticketTiers.findIndex(
    (el) => el.id === req.params.ticketId
  );
  if (typeof ticketIndex !== 'number')
    return next(new AppError('The specified ticket does not exist', 404));
  req.event.ticketTiers[ticketIndex].canceled = true;
  await req.event.save();
  await cancelAllBookings('ticket', req.params.ticketId);

  res.status(204).json({
    status: 'success',
    data: null,
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

exports.getMyBookedEvents = asyncCatch(async (req, res, next) => {
  //get user bookings and group by event
  const userBookings = await Booking.aggregate([
    { $match: { user: req.user._id, active: true } },
    { $project: { event: 1 } },
    { $group: { _id: '$event', total: { $sum: 1 } } },
  ]);

  const eventIds = userBookings.map((el) => el._id);
  const totalsMap = userBookings.reduce((acc, cur) => {
    return { ...acc, [cur._id]: cur.total };
  }, {});

  const queryFeatures = new APIFeatures(
    Event.find({ _id: { $in: eventIds } }),
    req.query
  ).filter();
  queryFeatures.query.select('name dateTimeStart photo');
  const events = await queryFeatures.query.lean();

  const eventsWithTotals = events.map((event) => {
    return { ...event, total: totalsMap[event._id] };
  });

  res.status(200).json({
    status: 'success',
    length: eventsWithTotals.length,
    data: {
      data: eventsWithTotals,
    },
  });
});

exports.uploadEventPhoto = upload.single('photo');

exports.getAllEvents = factory.getAll(Event, {
  path: 'ticketTiers.numBookings',
  select: '_id',
  match: {
    active: true,
  },
});
exports.getEvent = factory.getOne(Event, {
  path: 'ticketTiers.numBookings',
  select: '_id',
  match: {
    active: true,
  },
});
exports.createEvent = factory.createOne(Event);
exports.updateEvent = factory.updateOne(Event);
exports.deleteEvent = factory.deleteOne(Event);
