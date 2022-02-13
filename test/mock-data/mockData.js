const { eventBuilder, ticketBuilder } = require('./eventBuilder');
const { userBuilder } = require('./userBuilder');
const { bookingBuilder } = require('./bookingBuilder');

const mockData = (builder) => (num, settings = []) => {
  if (num === 1) {
    if (Array.isArray(settings)) {
      settings = settings[0];
    }

    return builder(settings);
  }

  if (!Array.isArray(settings)) {
    settings = [settings];
  }

  return new Array(num).fill(null).map((_, i) => builder(settings[i]));
};

const mockEvents = mockData(eventBuilder);
const mockUsers = mockData(userBuilder);
const mockBookings = mockData(bookingBuilder);
const mockTickets = mockData(ticketBuilder);

module.exports = {
  mockEvents,
  mockUsers,
  mockBookings,
  mockTickets,
};
