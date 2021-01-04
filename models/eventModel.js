const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'An event must have a name.'],
      unique: true,
      minlength: [8, 'An event name should have at least 8 characters.'],
    },
    eventType: {
      type: String,
      required: [true, 'Please specify an event type.'],
      enum: ['lecture', 'performance', 'social', 'workshop'],
    },
    description: {
      type: String,
      required: [true, 'An event must have a description.'],
    },
    summary: String,
    capacity: {
      type: Number,
      required: [true, 'Please specify the event capacity.'],
    },
    images: String,
    leaders: String,
    locations: [
      {
        type: {
          type: String,
          enum: ['Point'],
          default: ['Point'],
          required: true,
        },
        coordinates: {
          type: [Number],
          required: true,
        },
      },
    ],
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;
