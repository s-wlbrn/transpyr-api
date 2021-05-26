const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Booking must have a name.'],
    },
    email: {
      type: String,
      required: [true, 'Booking must be associated with an email'],
    },
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      //required: [true, 'Booking must belong to a user.'],
    },
    event: {
      type: mongoose.Schema.ObjectId,
      ref: 'Event',
      required: [true, 'Booking must belong to an event.'],
    },
    // email: {
    //   type: String,
    //   default: this.bookingEmail,
    // },
    ticket: {
      type: mongoose.Schema.ObjectId,
      ref: 'Event.ticketTiers',
      requires: [true, 'Booking must be for a valid ticket type.'],
    },
    price: {
      type: Number,
      required: [true, 'Booking must have a price.'],
    },
    createdAt: {
      type: Date,
      default: Date.now(),
    },
    paid: {
      type: Boolean,
      default: true,
    },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

//populate tour and user on query
// bookingSchema.pre(/^find/, function (next) {
//   this.populate('user').populate({
//     path: 'event',
//     select: 'name',
//   });
// });

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;
