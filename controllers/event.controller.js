const sharp = require('sharp');
const Event = require('../models/event.model');
const eventService = require('../services/event.service');
const Booking = require('../models/booking.model');
const factory = require('./handlerFactory');
const AppError = require('../libs/AppError');
const asyncCatch = require('../libs/asyncCatch');
const filterFields = require('../libs/filterFields');
const APIFeatures = require('../libs/apiFeatures');
const { cancelAllBookings } = require('../services/booking.service');
const multerUpload = require('../libs/multerUpload');
const s3Upload = require('../libs/s3Upload');

//passed to getOne handler to handle unpublished events
const authorizeUnpublishedEvent = (req, event) => {
  if (event.published) return true;

  if (
    !req.user ||
    (req.user.role !== 'admin' && req.user.id !== event.organizer.id)
  ) {
    return false;
  }
  return true;
};

exports.uploadEventPhoto = multerUpload.single('photo');

exports.processEventPhoto = asyncCatch(async (req, res, next) => {
  if (!req.file) return next(new AppError('Please provide a photo', 400));

  req.file.filename = `${req.params.id}.jpeg`;

  const data = await sharp(req.file.buffer)
    .toFormat('jpeg')
    .jpeg({ quality: 90 })
    .toBuffer();

  await s3Upload(data, 'events', req.file.filename);
  req.body.photo = req.file.filename;
  next();
});

exports.attachEventOrganizer = (req, res, next) => {
  req.body.organizer = req.user._id;
  next();
};

exports.getAndAuthorizeEvent = asyncCatch(async (req, res, next) => {
  const doc = await Event.findById(req.params.id);

  if (!doc) {
    return next(new AppError('Event not found.', 404));
  }
  if (
    req.user.role !== 'admin' &&
    String(doc.organizer) !== String(req.user._id)
  ) {
    return next(new AppError('Only the organizer may access this event.', 403));
  }
  req.event = doc;
  next();
});

exports.filterEventBody = asyncCatch(async (req, res, next) => {
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
  req.body = filteredBody;
  next();
});

exports.updateAndSaveEvent = asyncCatch(async (req, res, next) => {
  //handle updating past event
  if (new Date(req.event.dateTimeStart) < Date.now()) {
    return next(new AppError('Past events cannot be updated.', 400));
  }
  //handle updating canceled event
  if (req.event.canceled) {
    return next(new AppError('Canceled events cannot be updated.', 400));
  }
  // handle removing tickets
  if (
    req.body.ticketTiers &&
    req.body.ticketTiers.length < req.event.ticketTiers.length
  ) {
    return next(
      new AppError('Tickets cannot be removed from this endpoint.', 400)
    );
  }

  Object.assign(req.event, req.body);
  await req.event.save();

  res.status(200).json({
    status: 'success',
    data: {
      data: req.event,
    },
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
  )
    .filter()
    .limit();
  //queryFeatures.query.select('name dateTimeStart photo');
  const events = await queryFeatures.query.lean();

  const eventsWithTotals = events.map((event) => {
    return { ...event, total: totalsMap[event._id] };
  });

  res.status(200).json({
    status: 'success',
    results: eventsWithTotals.length,
    data: {
      data: eventsWithTotals,
    },
  });
});

//queries for published events only
exports.queryPublishedOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    req.query.published = true;
    return next();
  }
  next();
};

exports.queryOwnEvents = (req, res, next) => {
  req.query.organizer = req.user.id;
  next();
};

exports.getAllEvents = factory.getAll(Event);
exports.getEvent = eventService.getEventById({
  populate: { path: 'organizer', select: 'id name photo tagline' },
  authorize: authorizeUnpublishedEvent,
});
exports.createEvent = factory.createOne(Event);
exports.updateEvent = factory.updateOne(Event);
exports.deleteEvent = factory.deleteOne(Event);
