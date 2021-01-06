const Event = require('../models/eventModel');
const factory = require('./handlerFactory');

exports.getAllEvents = factory.getAll(Event);
//populate?
exports.getEvent = factory.getOne(Event);
exports.createEvent = factory.createOne(Event);
exports.updateEvent = factory.updateOne(Event);
exports.deleteEvent = factory.deleteOne(Event);
