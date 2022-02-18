const mongoose = require('mongoose');
const { build, fake } = require('@jackfranklin/test-data-bot');

exports.bookingBuilder = build('User', {
  fields: {
    orderId: String(mongoose.Types.ObjectId()),
    name: fake((f) => f.name.findName()),
    email: fake((f) => f.internet.email()),
    user: Math.random() < 0.5 ? String(mongoose.Types.ObjectId()) : undefined,
    event: mongoose.Types.ObjectId(),
    ticket: mongoose.Types.ObjectId(),
    price: fake((f) => f.datatype.number({ min: 0, max: 100 })),
  },
});
