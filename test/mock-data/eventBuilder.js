const { build, perBuild, oneOf, fake } = require('@jackfranklin/test-data-bot');
const mongoose = require('mongoose');
const { addHours } = require('../helpers/addHours');
const { randomInteger } = require('../helpers/randomInteger');

const ticketBuilder = build('Ticket', {
  fields: {
    tierName: fake((f) => f.lorem.words()),
    tierDescription: fake((f) => f.lorem.words()),
    price: fake((f) => f.datatype.number({ min: 0 })),
    online: fake((f) => f.datatype.boolean()),
    capacity: 0,
  },
  postBuild: (ticket) => {
    //generate limitPerCustomer based on capacity
    ticket.limitPerCustomer = randomInteger(0, ticket.capacity);
    //generate numBookings based on capacity
    return ticket;
  },
});

const locationBuilder = build('Location', {
  fields: {
    type: 'Point',
    coordinates: [
      fake((f) => f.address.longitude()),
      fake((f) => f.address.latitude()),
    ],
  },
});

const eventBuilder = build('Event', {
  fields: {
    name: fake((f) => f.lorem.words()),
    type: oneOf(
      'Lecture',
      'Class',
      'Performance',
      'Social',
      'Workshop',
      'Conference',
      'Convention',
      'Expo',
      'Game',
      'Rally',
      'Screening',
      'Tour'
    ),
    category: oneOf(
      'Business',
      'Food',
      'Health & Lifestyle',
      'Music',
      'Vehicle',
      'Charity',
      'Community',
      'Fashion',
      'Film',
      'Home',
      'Hobbies',
      'Performing & Visual Arts',
      'Politics',
      'Spirituality',
      'School',
      'Science & Technology',
      'Holiday',
      'Sports & Fitness',
      'Travel',
      'Outdoor & Recreation',
      'Other'
    ),
    description: fake((f) => f.lorem.paragraph(2)),
    ticketTiers: perBuild(() => {
      return new Array(randomInteger(1, 10)).fill(null).map(() => {
        return ticketBuilder();
      });
    }),
    totalCapacity: fake((f) => f.datatype.number({ min: 0, max: 5000 })),
    photo: 'default.jpeg',
    dateTimeStart: fake((f) => f.date.future()),
    createdAt: fake((f) => f.date.past()),
    organizer: String(mongoose.Types.ObjectId()),
    address: fake((f) =>
      f.fake(
        '{{address.streetAddress}}, {{address.city}}, {{address.stateAbbr}} {{address.zipCode}}'
      )
    ),
    location: locationBuilder(),
    published: perBuild(() => {
      return true;
    }),
    canceled: perBuild(() => {
      return false;
    }),
  },
  postBuild: (event) => {
    //calculate dateTimeEnd based on random number of hours from start
    event.dateTimeEnd = addHours(event.dateTimeStart, randomInteger(1, 48));
    //generate convertedDescription

    return event;
  },
});

module.exports = {
  eventBuilder,
  ticketBuilder,
};
