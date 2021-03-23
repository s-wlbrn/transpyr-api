const mongoose = require('mongoose');
const slugify = require('slugify');
const marked = require('marked');
const sanitizeHTML = require('sanitize-html');

const eventSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'An event must have a name.'],
    minlength: [8, 'An event name should have at least 8 characters.'],
  },
  type: {
    type: String,
    required: [true, 'Please specify an event type.'],
    enum: [
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
      'Tour',
    ],
  },
  category: {
    type: String,
    required: [true, 'Please specify an event category.'],
    enum: [
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
      'Other',
    ],
  },
  description: {
    type: String,
    required: [true, 'An event must have a description.'],
  },
  summary: String,
  ticketTiers: [
    {
      tierName: {
        type: String,
        required: true,
      },
      tierDescription: {
        type: String,
        required: true,
      },
      price: {
        type: Number,
        required: true,
      },
      online: {
        type: Boolean,
        required: true,
      },
      capacity: {
        type: Number,
        required: true,
      },
    },
  ],
  photo: {
    type: String,
    default: 'default.jpg',
  },
  dateTimeStart: {
    type: Date,
    required: true,
  },
  dateTimeEnd: {
    type: Date,
    required: true,
    validate: {
      validator: function (v) {
        return v > this.dateTimeStart;
      },
      message: 'The end date must be after the start date.',
    },
  },
  createdAt: {
    type: Date,
    default: Date.now(),
  },
  organizers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  address: String,
  location: {
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
  slug: String,
  published: {
    type: Boolean,
    default: false,
  },
});

eventSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    delete ret._id;
  },
});

//VIRTUAL
// Convert Markdown to HTML and sanitize
eventSchema.virtual('convertedDescription').get(function () {
  const test = this.description.replace(/\\n/g, '\n');
  return sanitizeHTML(marked(test));
});

eventSchema.virtual('priceDisplay').get(function () {
  const prices = this.ticketTiers.map((tier) => tier.price);
  prices.sort(function (a, b) {
    return a - b;
  });
  let priceDisplay = prices[0] ? `$${prices[0]}` : 'Free';
  if (prices.pop() > prices[0]) priceDisplay += '+';

  return priceDisplay;
});

//Create slug
eventSchema.pre('save', function (next) {
  this.slug = slugify(this.name, { lower: true });
  next();
});

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;
