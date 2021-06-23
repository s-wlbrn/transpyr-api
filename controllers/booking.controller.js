const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const qs = require('qs');
const Event = require('../models/event.model');
const User = require('../models/user.model');
const Booking = require('../models/booking.model');
const AppError = require('../libs/AppError');
const asyncCatch = require('../libs/asyncCatch');
const APIFeatures = require('../libs/apiFeatures');
const Email = require('../libs/email');

const getRefundRequests = async (query) => {
  const requestBookings = await Booking.aggregate([
    { $match: query },
    {
      $lookup: {
        from: 'events',
        localField: 'event',
        foreignField: '_id',
        as: 'event',
      },
    },
    { $unwind: '$event' },
    {
      $addFields: {
        ticketData: {
          $first: {
            $filter: {
              input: '$event.ticketTiers',
              as: 'tier',
              cond: { $eq: ['$price', '$$tier.price'] },
            },
          },
        },
      },
    },
    {
      $group: {
        _id: '$refundRequest._id',
        name: { $first: '$name' },
        email: { $first: '$email' },
        createdAt: { $first: '$createdAt' },
        event: {
          $first: {
            id: '$event._id',
            name: '$event.name',
            organizer: '$event.organizer',
          },
        },
        tickets: { $push: { price: '$price', ticket: '$ticketData' } },
      },
    },
  ]);

  return requestBookings;
};

exports.getBooking = asyncCatch(async (req, res, next) => {
  const doc = await Booking.findOneById(req.params.id).populate('event');

  res.status(200).json({
    status: 'success',
    data: doc,
  });
});

exports.resolveRefundRequest = asyncCatch(async (req, res, next) => {
  // get booking, populate event
  const bookings = await Booking.find({
    'refundRequest._id': req.params.id,
    'refundRequest.resolved': false,
  }).populate({ path: 'event', select: 'organizer name' });
  //Validate
  if (!bookings.length)
    return next(
      new AppError(
        'No bookings with the specified refund request ID were found.',
        404
      )
    );
  if (req.user.id !== String(bookings[0].event.organizer))
    return next(
      new AppError(
        'You are not the organizer of the event this booking belongs to.',
        403
      )
    );
  if (!['accepted', 'rejected'].includes(req.query.status))
    return next(
      new AppError(
        'Please specify a valid status to resolve the refund request.',
        400
      )
    );
  //Map edited bookings to array of save promises
  const updatedBookingsPromises = bookings.map((booking) => {
    booking.refundRequest.status = req.query.status;
    booking.refundRequest.resolved = true;
    if (req.query.status === 'accepted') {
      booking.active = false;
    }
    return booking.save();
  });
  //update bookings
  const updatedBookings = await Promise.all(updatedBookingsPromises);

  // create email senders for organizer and attendee
  const emailOrganizer = new Email(req.user, null, bookings[0].event.name);
  const emailAttendee = new Email(
    { name: bookings[0].name, email: bookings[0].email },
    null,
    bookings[0].event.name
  );
  //send emails
  if (req.query.status === 'accepted') {
    await Promise.all([
      emailOrganizer.sendCancelationRequestAcceptedOrganizer,
      emailAttendee.sendCancelationRequestAcceptedAttendee,
    ]);
  } else {
    //email rejected
  }

  res.status(200).json({
    status: 'success',
    length: updatedBookings.length,
    data: updatedBookings,
  });
});

exports.requestRefund = asyncCatch(async (req, res, next) => {
  if (!req.body.selectedIdsArray)
    return next(
      new AppError('Please specify an array of booking IDs to cancel.', 400)
    );

  await Booking.updateMany(
    { user: req.user.id, _id: { $in: req.body.selectedIdsArray } },
    { refundRequest: { cancelationReason: req.body.cancelationReason } }
  );

  //get event and send email to organizer
  const event = await Event.findById(req.params.id)
    .select('organizer')
    .populate('organizer');
  await new Email(
    event.organizer,
    `${process.env.FRONTEND_HOST}/events/id/${event.id}/refund-requests`
  ).sendCancelationRequestOrganizer();

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.getBookings = asyncCatch(async (req, res, next) => {
  const queryFeatures = new APIFeatures(Booking.find(), req.query)
    .filter()
    .sort();
  queryFeatures.query
    .find({ user: req.user.id, active: true })
    .populate({ path: 'event', select: 'name dateTimeStart ticketTiers' });
  const bookings = await queryFeatures.query;

  res.status(200).json({
    status: 'success',
    length: bookings.length,
    data: bookings,
  });
});

exports.getRefundRequestById = asyncCatch(async (req, res, next) => {
  const bookings = await getRefundRequests({
    'refundRequest._id': mongoose.Types.ObjectId(req.params.id),
    'refundRequest.resolved': false,
  });

  if (!bookings.length)
    return next(new AppError('No refund requests for this event.', 404));
  if (String(bookings[0].event.organizer) !== req.user.id)
    return next(new AppError('You are not the organizer of this event.', 403));

  res.status(200).json({
    status: 'success',
    length: bookings.length,
    data: bookings,
  });
});

exports.getEventRefundRequests = asyncCatch(async (req, res, next) => {
  const bookings = await getRefundRequests({
    event: mongoose.Types.ObjectId(req.params.id),
    'refundRequest.resolved': false,
  });

  if (!bookings.length)
    return next(new AppError('No refund requests for this event.', 404));
  if (String(bookings[0].event.organizer) !== req.user.id)
    return next(new AppError('You are not the organizer of this event.', 403));

  res.status(200).json({
    status: 'success',
    length: bookings.length,
    data: bookings,
  });
});

exports.getCheckoutSession = asyncCatch(async (req, res, next) => {
  const { tickets } = req.body;

  //get event to book from params
  const event = await Event.findById(req.params.eventId).populate({
    path: 'ticketTiers.numBookings',
    select: '_id',
    match: {
      active: true,
    },
  });
  //handle no event
  if (!event)
    return next(new AppError('The specified event does not exist.', 404));
  //handle event canceled
  if (event.canceled)
    return next(new AppError('The specified event is canceled.', 400));
  //handle event sold out
  //or numBookings + quantity is greater than capacity!
  if (event.soldOut)
    return next(new AppError('The specified event is sold out.', 400));

  //if user sent, fetch user
  let user = '';
  if (req.body.user) {
    const userDoc = await User.findById(req.body.user);
    //handle invalid user
    if (!userDoc)
      return next(new AppError('No user with the specified ID exists', 404));
    user = userDoc;
  }

  //Make email field
  const customerEmail = user.email || req.body.email;
  //handle no booking email
  if (!customerEmail)
    return next(
      new AppError('You must specify an email for the booking.', 400)
    );

  //Create map of ticket tiers for easy lookup
  //ticketTier map into an instance method?
  const ticketKeys = Object.keys(tickets);
  const ticketTiersMap = ticketKeys.reduce((acc, ticketId) => {
    const ticket = event.ticketTiers.find((el) => el.id === ticketId);
    return { ...acc, [ticketId]: { ...ticket._doc } };
  }, {});

  //handle canceled or sold out ticket
  for (const ticketId of ticketKeys) {
    if (ticketTiersMap[ticketId].canceled) {
      return next(
        new AppError('One of the selected tickets has been canceled.', 400)
      );
      //or numBookings + quantity is greater than capacity!
    } else if (ticketTiersMap[ticketId].ticketSoldOut) {
      return next(
        new AppError('One of the selected tickets is sold out.', 400)
      );
    }
  }

  const lineItems = ticketKeys.map((ticketId) => {
    return {
      price_data: {
        currency: 'usd',
        unit_amount:
          event.feePolicy === 'absorbFee'
            ? Math.floor(ticketTiersMap[ticketId].price * 1.03 * 100)
            : ticketTiersMap[ticketId].price * 100,
        product_data: {
          name: `${event.name}: ${ticketTiersMap[ticketId].tierName}`,
          description: ticketTiersMap[ticketId].tierDescription,
        },
      },
      quantity: tickets[ticketId],
    };
  });

  //Create tickets array for booking
  //future- create bookings with paid:false and update after successful checkout
  const ticketsArray = ticketKeys.flatMap((ticketId) => {
    const individualBookings = [];
    // create booking objects with ticket id and price according to quantity
    for (let i = 0; i < tickets[ticketId]; i += 1) {
      individualBookings.push({
        ticket: ticketId,
        price: ticketTiersMap[ticketId].price,
      });
    }
    return individualBookings;
  });

  //TEMP: Stringify the object to send to createCheckoutBookings as a query string
  const queryString = qs.stringify({
    name: req.body.name,
    event: req.params.eventId,
    user: user.id,
    tickets: ticketsArray,
    email: customerEmail,
  });

  //create checkout session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    //TEMPORARY: Creating booking documents requires stripe webhooks once app is deployed. Query string workaround is not secure.
    //This should be a special page on the front end that displays a spinner and calls a temp createCheckoutBookings route to call func
    success_url: `${req.protocol}://${process.env.FRONTEND_HOST}/bookings/create?${queryString}`,
    cancel_url: `${req.protocol}://${process.env.FRONTEND_HOST}/events/id/${req.params.eventId}`,
    customer_email: customerEmail, //user email, will be either provided by guest or sent automatically if logged in
    client_reference_id: req.params.eventId,
    line_items: lineItems,
  });

  //send to client
  res.status(200).json({
    status: 'success',
    id: session.id,
  });
});

exports.createCheckoutBookings = async (req, res, next) => {
  if (!req.query) return next(new AppError('Invalid checkout session.', 400));

  //parse query string with qs directly since Express isn't doing it right
  const { name, event, user, email, tickets } = qs.parse(
    req.originalUrl.split('?')[1]
  );

  if (!event || !email || !tickets || !name)
    return next(new AppError('Invalid checkout session.', 400));

  //TEMP: qs bug is putting } at the end of email field
  let fixedEmail = email.split('');
  fixedEmail.pop();
  fixedEmail = fixedEmail.join('');

  //create bookings
  const bookings = await Promise.all(
    tickets.map(async (ticket) => {
      return Booking.create({
        event,
        user,
        email: fixedEmail,
        name,
        ticket: ticket.ticket,
        price: ticket.price,
      });
    })
  );

  res.status(201).json({
    status: 'success',
    data: {
      data: bookings,
    },
  });
};

exports.createBookings = asyncCatch(async (req, res, next) => {
  const { name, event, user, email, tickets } = req.body;

  const bookings = await Promise.all(
    tickets.map(async (ticket) => {
      return await Booking.create({
        event,
        user,
        email,
        name,
        ticket: ticket.ticket,
        price: ticket.ticket.price,
      });
    })
  );

  res.status(201).json({
    status: 'success',
    data: {
      data: bookings,
    },
  });
});
