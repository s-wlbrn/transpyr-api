const sharp = require('sharp');
const Event = require('../models/event.model');

//Photo upload
exports.processEventPhoto = async (buffer) => {
  const data = await sharp(buffer)
    .toFormat('jpeg')
    .jpeg({ quality: 90 })
    .toBuffer();

  return data;
};

//Queries
exports.getEventById = async (id, options = {}) => {
  const query = Event.findById(id);

  if (options.organizer) {
    query.select('organizer');
    query.populate({
      path: 'organizer',
      select: 'name email',
    });
  }
  const event = await query;

  return event;
};

//Helpers
exports.authorizeUnpublishedEvent = (req, event) => {
  if (event.published) return true;

  if (
    !req.user ||
    (req.user.role !== 'admin' && req.user.id !== event.organizer.id)
  ) {
    return false;
  }
  return true;
};

exports.findTicketIndexById = (tickets, id) =>
  tickets.findIndex((el) => el.id === id);

exports.extractEventIds = (events) => events.map((el) => el._id);

exports.mapEventIdsToTotalBookings = (events) =>
  events.reduce((acc, cur) => {
    return { ...acc, [cur._id]: cur.total };
  }, {});

exports.addBookingTotalsToEvents = (events, totalsMap) =>
  events.map((event) => {
    return { ...event, total: totalsMap[event._id] };
  });
