const mongoose = require('mongoose');
const slugify = require('slugify');
const marked = require('marked');
const sanitizeHTML = require('sanitize-html');
const { Booking } = require('./booking.model');

const ticketTiersSchema = new mongoose.Schema(
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
    limitPerCustomer: {
      type: Number,
      default: 0,
      validate: {
        validator: function (v) {
          return this.capacity === 0 ? true : v < this.capacity;
        },
        message: 'Limit per customer cannot exceed maximum number of tickets.',
      },
    },
  },
  { toObject: { virtuals: true } }
);

const eventSchema = new mongoose.Schema(
  {
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
    ticketTiers: [ticketTiersSchema],
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
    organizer: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
    },
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
  },
  {
    toObject: { virtuals: true },
  }
);

eventSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    delete ret._id;
  },
});

ticketTiersSchema.set('toJSON', {
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

// eventSchema.virtual('priceDisplay').get(function () {
//   const prices = this.ticketTiers.map((tier) => tier.price);
//   prices.sort(function (a, b) {
//     return a - b;
//   });
//   let priceDisplay = prices[0] ? `$${prices[0]}` : 'Free';
//   if (prices.pop() > prices[0]) priceDisplay += '+';

//   return priceDisplay;
// });

eventSchema.virtual('totalCapacity').get(function () {
  const totalCapacity = this.ticketTiers.reduce(
    (acc, ticket) => acc + ticket.capacity,
    0
  );
  return totalCapacity;
});

eventSchema.virtual('ticketTiers.numBookings', {
  ref: 'Booking',
  localField: 'ticketTiers._id',
  foreignField: 'ticket',
  justOne: false,
  count: true,
});

eventSchema.virtual('totalBookings', {
  ref: 'Booking',
  localField: '_id',
  foreignField: 'event',
  justOne: false,
  count: true,
});

ticketTiersSchema.virtual('ticketSoldOut').get(function () {
  const soldOut = !this.capacity ? false : !(this.numBookings < this.capacity);
  return soldOut;
});

//MIDDLEWARE

const autoPopulate = function (next) {
  this.populate({ path: 'ticketTiers.numBookings' }).populate({
    path: 'totalBookings',
  });
  next();
};
eventSchema.pre(/^find/, autoPopulate);

//Create slug
eventSchema.pre('save', function (next) {
  this.slug = slugify(this.name, { lower: true });
  next();
});

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;
