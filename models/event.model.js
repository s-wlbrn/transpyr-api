const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');
const slugify = require('slugify');
const marked = require('marked');
const sanitizeHTML = require('sanitize-html');
const {
  uniqueTicketNames,
  ticketCapacitiesWithinTotal,
  noSpareTickets,
} = require('../validators/event.validators');

const ticketTiersSchema = new mongoose.Schema(
  {
    tierName: {
      type: String,
      required: true,
      maxLength: [50, 'Ticket name cannot exceed 50 characters.'],
      //unique
    },
    tierDescription: {
      type: String,
      required: true,
      maxLength: [150, 'Ticket description cannot exceed 150 characters.'],
    },
    price: {
      type: Number,
      required: true,
      min: [0, 'Ticket price must be a positive number.'],
    },
    online: {
      type: Boolean,
      required: true,
    },
    capacity: {
      type: Number,
      default: 0,
      min: [0, 'Ticket capacity must be a positive number.'],
    },
    limitPerCustomer: {
      type: Number,
      default: 0,
      min: [0, 'Per-customer limit must be a positive number.'],
      validate: {
        validator: function (v) {
          return this.capacity === 0 || v <= this.capacity;
        },
        message: 'Limit per customer cannot exceed ticket capacity.',
      },
    },
    canceled: {
      type: Boolean,
      default: false,
    },
  },
  { toObject: { virtuals: true } }
);

const locationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: 'Point',
    default: 'Point',
  },
  coordinates: {
    type: [Number],
    required: true,
    validate: {
      validator: function (v) {
        return v.length === 2;
      },
      message: 'Invalid coordinates.',
    },
  },
});

const eventSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'An event must have a name.'],
      minlength: [8, 'Event name should be at least 8 characters.'],
      maxlength: [75, 'Event name cannot exceed 75 characters.'],
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
    convertedDescription: String,
    summary: String,
    ticketTiers: {
      type: [ticketTiersSchema],
      required: [true, 'An event must have ticket tiers.'],
      validate: [
        // min length of 1
        {
          validator: function (v) {
            return v.length >= 1;
          },
          message: 'At least one ticket type is required.',
        },
        // max length of 10
        {
          validator: function (v) {
            return v.length <= 10;
          },
          message: 'An event cannot have more than 10 ticket types.',
        },
        // unique ticket names
        {
          validator: uniqueTicketNames,
          message: 'Ticket names must be unique.',
        },
        // ticket capacities cannot exceed event capacity
        {
          validator: ticketCapacitiesWithinTotal,
          message: 'Ticket capacities cannot exceed the event total capacity.',
        },
        // no spare tickets when all capacities set
        {
          validator: noSpareTickets,
          message:
            'When all tickets have limited capacity, they must equal the event total capacity.',
        },
      ],
    },
    photo: {
      type: String,
      default: 'default.jpg',
    },
    dateTimeStart: {
      type: Date,
      required: true,
      min: [Date.now(), 'Event start date must be in the future.'],
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
      select: true,
    },
    address: {
      type: String,
      validate: {
        validator: function (v) {
          return !!v === !!this.location;
        },
        message: 'An event cannot have an address without a location.',
      },
    },
    location: {
      type: locationSchema,
      validate: {
        validator: function (v) {
          return !!this.address === !!v;
        },
        message: 'An event cannot have a location without an address.',
      },
    },
    totalCapacity: {
      type: Number,
      required: [true, 'Event total capacity is required.'],
      default: 0,
      min: [0, 'Capacity cannot be negative.'],
    },
    feePolicy: {
      type: String,
      enum: {
        values: ['absorbFee', 'passFee'],
        message: "Fee policy must be either 'absorbFee' or 'passFee'.",
      },
    },
    refundPolicy: String,
    language: {
      type: String,
      default: 'English',
    },
    slug: String,
    online: Boolean,
    canceled: {
      type: Boolean,
      default: false,
    },
    published: {
      type: Boolean,
      default: false,
      select: true,
    },
  },
  {
    toObject: { virtuals: true },
  }
);

//Indices
eventSchema.index(
  { name: 'text', description: 'text' },
  { name: 'event index', weights: { name: 2, description: 1 } }
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
eventSchema.virtual('ticketTiers.numBookings', {
  ref: 'Booking',
  localField: 'ticketTiers._id',
  foreignField: 'ticket',
  justOne: false,
  //mongoose bug- virtual populate count not working for subdocument
  //count: true,
});

ticketTiersSchema.virtual('ticketSoldOut').get(function () {
  if (!this.numBookings) return undefined;
  const soldOut = !this.capacity
    ? false
    : !(this.numBookings.length < this.capacity);
  return soldOut;
});

eventSchema.virtual('totalBookings').get(function () {
  if (!this.ticketTiers) return undefined;
  const totalCount = this.ticketTiers.reduce(
    (acc, tier) => tier.numBookings.length + acc,
    0
  );
  return totalCount;
});

eventSchema.virtual('soldOut').get(function () {
  if (this.totalBookings === undefined) return undefined;
  const soldOut = !this.totalCapacity
    ? false
    : !(this.totalBookings < this.totalCapacity);
  return soldOut;
});

//MIDDLEWARE

//Create slug
eventSchema.pre('save', function (next) {
  this.slug = slugify(this.name, { lower: true });
  next();
});

//Create online field
eventSchema.pre('save', function (next) {
  let isOnline = false;
  //Flag event 'online' if any ticket tier online.
  this.ticketTiers.forEach((tier) => {
    if (tier.online === true) isOnline = true;
  });
  this.online = isOnline;
  next();
});

//Convert description to markdown
eventSchema.pre('save', function (next) {
  // if (!this.isModified('description')) return next();

  //newlines not saved correctly without this
  const fixedNewlines = this.description.replace(/\\n/g, '\n');
  this.convertedDescription = sanitizeHTML(marked(fixedNewlines));
  next();
});

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;
