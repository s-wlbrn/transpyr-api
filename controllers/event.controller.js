const Event = require('../models/event.model');
const factory = require('./handlerFactory');
const filterFields = require('../libs/filterFields');
const {
  cancelAllBookings,
  getUserBookedEventsWithTotals,
} = require('../services/booking.service');
const eventService = require('../services/event.service');
const AppError = require('../libs/AppError');
const asyncCatch = require('../libs/asyncCatch');
const APIFeatures = require('../libs/apiFeatures');
const multerUpload = require('../libs/multerUpload');
const S3Service = require('../services/S3.service');

exports.uploadEventPhoto = multerUpload.single('photo');

exports.processEventPhoto = asyncCatch(async (req, res, next) => {
  if (!req.file) return next(new AppError('Please provide a photo', 400));

  req.file.filename = `${req.params.id}.jpeg`;

  const processedPhoto = await eventService.processEventPhoto(req.file.buffer);

  await S3Service.uploadImage(processedPhoto, 'events', req.file.filename);
  req.body.photo = req.file.filename;
  next();
});

exports.attachEventOrganizer = (req, res, next) => {
  req.body.organizer = req.user._id;
  next();
};

exports.getAndAuthorizeEvent = asyncCatch(async (req, res, next) => {
  const event = await eventService.getEventById(req.params.id);

  if (!event) {
    return next(new AppError('Event not found.', 404));
  }
  if (
    req.user.role !== 'admin' &&
    String(event.organizer) !== String(req.user._id)
  ) {
    return next(new AppError('Only the organizer may access this event.', 403));
  }
  req.event = event;
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
  if (req.event.canceled) {
    return next(new AppError('Event is already canceled.', 400));
  }

  if (new Date(req.event.dateTimeStart) < Date.now()) {
    return next(new AppError('Past events cannot be canceled.', 400));
  }

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
  if (new Date(req.event.dateTimeStart) < Date.now()) {
    return next(new AppError('Unable to cancel tickets of past events.', 400));
  }

  //handle last active ticket
  if (req.event.ticketTiers.filter((t) => t.canceled === false).length === 1) {
    return next(
      new AppError('Unable to cancel the last ticket of an event.', 400)
    );
  }

  if (req.event.canceled) {
    return next(new AppError('Event is already canceled.', 400));
  }

  const ticketIndex = eventService.findTicketIndexById(
    req.event.ticketTiers,
    req.params.ticketId
  );

  if (ticketIndex < 0) {
    return next(new AppError('The specified ticket does not exist', 404));
  }

  if (req.event.ticketTiers[ticketIndex].canceled) {
    return next(new AppError('The specified ticket is already canceled', 400));
  }

  req.event.ticketTiers[ticketIndex].canceled = true;
  await req.event.save();
  await cancelAllBookings('ticket', req.params.ticketId);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.publishEvent = asyncCatch(async (req, res, next) => {
  if (new Date(req.event.dateTimeStart) < Date.now()) {
    return next(
      new AppError(
        'Past events cannot be published. Please change the start date.',
        400
      )
    );
  }

  if (req.event.published) {
    next(new AppError('Event is already published.', 400));
  }

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
  const bookedEvents = await getUserBookedEventsWithTotals(req.user._id);

  const eventIds = eventService.extractEventIds(bookedEvents);

  const queryFeatures = new APIFeatures(
    Event.find({ _id: { $in: eventIds } }),
    req.query
  )
    .filter()
    .limit();

  const events = await queryFeatures.query.lean();

  const totalsMap = eventService.mapEventIdsToTotalBookings(bookedEvents);
  const eventsWithTotals = eventService.addBookingTotalsToEvents(
    events,
    totalsMap
  );

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
exports.getEvent = factory.getOne(Event, {
  populate: { path: 'organizer', select: 'id name photo tagline' },
  authorize: eventService.authorizeUnpublishedEvent,
});
exports.createEvent = factory.createOne(Event);
exports.updateEvent = factory.updateOne(Event);
exports.deleteEvent = factory.deleteOne(Event);
