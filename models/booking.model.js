const mongoose = require('mongoose');

const refundRequestSchema = new mongoose.Schema({
  createdAt: {
    type: Date,
    default: Date.now(),
  },
  resolved: {
    type: Boolean,
    default: false,
    validate: {
      validator: function (v) {
        return !v || !!this.status;
      },
      message: 'Refund request cannot be resolved without a status.',
    },
  },
  status: {
    type: String,
    enum: ['accepted', 'rejected'],
  },
  reason: {
    type: String,
    max: [150, 'Cancelation reason cannot be more than 150 characters.'],
  },
  refundProcessed: {
    type: Boolean,
    default: false,
  },
});

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
    active: {
      type: Boolean,
      default: true,
    },
    refundRequest: refundRequestSchema,
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

bookingSchema.virtual('ticketData').get(function () {
  if (!this.event || !this.event.ticketTiers) return undefined;
  const matchingTicket = this.event.ticketTiers.find(
    (el) => String(el.id) === String(this.ticket)
  );
  return matchingTicket;
});

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;
