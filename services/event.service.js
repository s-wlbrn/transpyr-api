const factory = require('../controllers/handlerFactory');
const Event = require('../models/event.model');

//Queries
exports.getEventById = (options) => factory.getOne(Event, options);
