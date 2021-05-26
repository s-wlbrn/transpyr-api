const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');
const slugify = require('slugify');
const marked = require('marked');
const sanitizeHTML = require('sanitize-html');

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
      default: 0,
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
      required: [true, 'An event must have an organizer.'],
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
    totalCapacity: {
      type: Number,
      default: 0,
      min: [0, 'Capacity cannot be negative'],
      validate: {
        validator: function (v) {
          const ticketCapacities = this.ticketTiers.reduce(
            (acc, ticket) => acc + ticket.capacity,
            0
          );

          return v > 0 ? v >= ticketCapacities : true;
        },
        message:
          'The total capacity cannot be less than the ticket capacities.',
      },
    },
    feePolicy: {
      type: String,
      enum: {
        values: ['absorbFee', 'passFee'],
        message: "Fee policy must be either 'absorbFee' or 'passFee'",
      },
    },
    refundPolicy: String,
    language: {
      type: String,
      default: 'English',
    },
    slug: String,
    online: Boolean,
    published: {
      type: Boolean,
      default: false,
      // validate: {
      //   validator: function (v) {
      //     if (v) return !!this.feePolicy;
      //   },
      //   message: 'An event cannot be published without a fee policy.',
      // },
    },
  },
  {
    selectPopulatedPaths: false,
    toObject: { virtuals: true },
  }
);

//Settings
eventSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
});

ticketTiersSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
});

//Plugins
eventSchema.plugin(mongoosePaginate);

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

eventSchema.virtual('soldOut').get(function () {
  const soldOut = !this.totalCapacity
    ? false
    : !(this.totalBookings < this.totalCapacity);
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

//Create online field
eventSchema.pre('save', function (next) {
  let isOnline = false;
  //Flag event 'online' if any ticket tier online
  this.ticketTiers.forEach((tier) => {
    if (tier.online === true) isOnline = true;
  });

  this.online = isOnline;
  next();
});

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;
