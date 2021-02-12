const mongoose = require('mongoose');
const slugify = require('slugify');
const axios = require('axios');

const asyncCatch = require('../libs/asyncCatch');

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
    priceTiers: [
      {
        name: {
          type: String,
          required: true,
        },
        price: {
          type: Number,
          required: true,
        },
        online: Boolean,
        capacity: Number,
      },
    ],
    capacity: {
      type: Number,
    },
    photo: {
      type: String,
      default: 'default.jpg',
    },
    date: {
      type: Date,
      required: true,
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
    online: Boolean,
    address: String,
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
  let isOnline = false;
  let totalCapacity = 0;
  //Add up event capacities
  //Flag event 'online' if any ticket tier online
  this.priceTiers.forEach((tier) => {
    totalCapacity += tier.capacity;
    if (tier.online === true) isOnline = true;
  });

  this.capacity = totalCapacity;
  this.online = isOnline;
  next();
});

eventSchema.pre('save', async function (next) {
  try {
    console.log(this.address);
    if (!this.address) next();

    //Fetch address coordinates from HERE API
    const matchingLoc = await axios.get(
      `https://geocode.search.hereapi.com/v1/geocode?q="${this.address}"&apiKey=${process.env.HERE_APIKEY}`
    );
    console.log(matchingLoc);
    const { lat, lng } = matchingLoc.data.items[0].position;

    //Save to locations field
    this.locations = {
      type: 'Point',
      coordinates: [lng, lat],
    };
    next();
  } catch (err) {
    next(err);
  }
});

eventSchema.pre('save', function (next) {
  this.slug = slugify(this.name, { lower: true });
  next();
});

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;
