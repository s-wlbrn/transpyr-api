const mongoose = require('mongoose');
const slugify = require('slugify');

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
      enum: [
        'lecture',
        'class',
        'performance',
        'social',
        'workshop',
        'conference',
        'convention',
        'expo',
        'game',
        'rally',
        'screening',
        'tour',
      ],
    },
    category: {
      type: String,
      required: [true, 'Please specify an event category.'],
      enum: [
        'Business',
        'Food',
        'Health and Lifestyle',
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
        'Science and Technology',
        'Holiday',
        'Sports and Fitness',
        'Travel',
        'Outdoor & Recreation',
        'Other',
      ],
    },
    description: {
      type: String,
      required: [true, 'An event must have a description.'],
    },
    summary: String,
    price: Number,
    capacity: {
      type: Number,
      required: [true, 'Please specify the event capacity.'],
    },
    photo: {
      type: String,
      default: 'default.jpg',
    },
    createdAt: {
      type: Date,
      default: Date.now(),
    },
    organizers: [
      {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
      },
    ],
    online: {
      type: Boolean,
    },
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
    slug: String,
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

eventSchema.pre('save', function (next) {
  this.slug = slugify(this.name, { lower: true });
  next();
});

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;
