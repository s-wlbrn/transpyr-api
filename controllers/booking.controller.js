const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Event = require('../models/event.model');
const User = require('../models/user.model');
const Booking = require('../models/booking.model');
const AppError = require('../libs/AppError');
const asyncCatch = require('../libs/asyncCatch');
const APIFeatures = require('../libs/apiFeatures');
const Email = require('../libs/email');
const factory = require('./handlerFactory');

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
        _id: '$refundRequest.requestId',
        name: { $first: '$name' },
        email: { $first: '$email' },
        createdAt: { $first: '$refundRequest.createdAt' },
        reason: { $first: '$refundRequest.reason' },
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

exports.resolveRefundRequest = asyncCatch(async (req, res, next) => {
  // get booking, populate event
  const bookings = await Booking.find({
    'refundRequest.requestId': req.params.id,
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
  if (
    req.user.id !== String(bookings[0].event.organizer) &&
    req.user.role !== 'admin'
  )
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
      emailOrganizer.sendCancelationRequestAcceptedOrganizer(),
      emailAttendee.sendCancelationRequestAcceptedAttendee(),
    ]);
  } else {
    //email rejected
    await emailAttendee.sendCancelationRequestRejectedAttendee();
  }

  res.status(200).json({
    status: 'success',
    length: updatedBookings.length,
    data: updatedBookings,
  });
});

exports.requestRefund = asyncCatch(async (req, res, next) => {
  if (!req.body.selectedIdsArray)
    return next(new AppError('Please specify bookings to cancel.', 400));

  const bookings = await Booking.find({
    user: req.user.id,
    _id: { $in: req.body.selectedIdsArray },
  });
  //create uuid for refund request
  const requestId = mongoose.Types.ObjectId();
  //map bookings with refundRequest added, return array of promises
  const updatedBookingsPromises = bookings.map((booking) => {
    if (booking.price) {
      booking.refundRequest = {
        requestId,
        reason: req.body.cancelationReason || undefined,
        resolved: false,
      };
    } else {
      booking.active = false;
    }
    return booking.save();
  });
  //update bookings
  await Promise.all(updatedBookingsPromises);

  //get event and send email to organizer
  const event = await Event.findById(req.params.id)
    .select('organizer')
    .populate('organizer');
  await new Email(
    event.organizer,
    `${process.env.FRONTEND_HOST}/bookings/refund-requests/${requestId}`
  ).sendCancelationRequestOrganizer();

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.getRefundRequestById = asyncCatch(async (req, res, next) => {
  const bookings = await getRefundRequests({
    'refundRequest.requestId': mongoose.Types.ObjectId(req.params.id),
    'refundRequest.resolved': false,
  });

  if (
    bookings.length &&
    String(bookings[0].event.organizer) !== req.user.id &&
    req.user.role !== 'admin'
  )
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

  if (
    bookings.length &&
    String(bookings[0].event.organizer) !== req.user.id &&
    req.user.role !== 'admin'
  )
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
  if (event.soldOut)
    return next(new AppError('The specified event is sold out.', 400));

  //calculate total number of tickets requested
  const ticketKeys = Object.keys(tickets);
  const selectedTicketsCount = ticketKeys.reduce(
    (acc, cur) => acc + tickets[cur],
    0
  );

  //handle requested tickets going over capacity
  if (
    event.totalCapacity > 0 &&
    selectedTicketsCount + event.totalBookings > event.totalCapacity
  )
    return next(
      new AppError(
        'There are not enough remaining tickets to complete the order.',
        400
      )
    );

  //map info for all selected tickets
  const selectedTicketTiersMap = ticketKeys.reduce((acc, ticketId) => {
    const ticket = event.ticketTiers.find((el) => el.id === ticketId);
    return { ...acc, [ticketId]: { ...ticket._doc } };
  }, {});

  //validate each ticket selection
  ticketKeys.forEach((ticketId) => {
    const selectedTicket = selectedTicketTiersMap[ticketId];
    //handle ticket canceled
    if (selectedTicket.canceled) {
      return next(
        new AppError(
          `One of the selected tickets has been canceled: "${selectedTicket.tierName}"`,
          400
        )
      );
    }
    //handle ticket sold out
    if (selectedTicket.ticketSoldOut) {
      return next(
        new AppError(
          `One of the selected tickets is sold out: "${selectedTicket.tierName}"`,
          400
        )
      );
    }
    //handle selected tickets over limitPerCustomer
    if (
      selectedTicket.limitPerCustomer > 0 &&
      tickets[ticketId] > selectedTicket.limitPerCustomer
    ) {
      return next(
        new AppError(
          `Ticket "${selectedTicket.tierName}" has a limit of ${selectedTicket.limitPerCustomer} per customer.`,
          400
        )
      );
    }
    //handle requested tickets going over ticket capacity
    if (
      selectedTicket.capacity > 0 &&
      tickets[ticketId] + selectedTicket.numBookings.length >
        selectedTicket.capacity
    ) {
      return next(
        new AppError(
          `There are not enough remaining tickets for "${selectedTicket.tierName}" to complete the order.`,
          400
        )
      );
    }
  });

  //if user sent, fetch user
  let user = '';
  if (req.body.user) {
    const userDoc = await User.findById(req.body.user);
    //handle invalid user
    if (!userDoc)
      return next(new AppError('No user with the specified ID exists', 404));
    user = userDoc;
  }

  //get email
  const customerEmail = user.email || req.body.email;
  //handle no booking email
  if (!customerEmail)
    return next(new AppError('Please specify an email for the booking.', 400));

  //create order ID
  const orderId = new mongoose.Types.ObjectId();

  //create Stripe line_items
  const lineItems = ticketKeys.map((ticketId) => {
    const selectedTicket = selectedTicketTiersMap[ticketId];

    return {
      price_data: {
        currency: 'usd',
        unit_amount:
          event.feePolicy === 'passFee'
            ? Math.floor(selectedTicket.price * 1.03 * 100)
            : selectedTicket.price * 100,
        product_data: {
          name: `${event.name}: ${selectedTicket.tierName}`,
          description: selectedTicket.tierDescription,
          metadata: {
            ticketId: String(selectedTicket._id),
          },
        },
      },
      quantity: tickets[ticketId],
    };
  });

  // //Create tickets array for creating database bookings
  // //TODO create bookings with paid:false and update after successful checkout
  // const ticketsArray = ticketKeys.flatMap((ticketId) => {
  //   const individualBookings = [];
  //   // create booking objects with ticket id and price according to quantity
  //   for (let i = 0; i < tickets[ticketId]; i += 1) {
  //     individualBookings.push({
  //       ticket: ticketId,
  //       price: selectedTicketTiersMap[ticketId].price,
  //     });
  //   }
  //   return individualBookings;
  // });

  //TEMP: Stringify the object to send to createCheckoutBookings as a query string
  // const queryString = qs.stringify({
  //   name: req.body.name,
  //   event: req.params.eventId,
  //   user: user.id,
  //   tickets: ticketsArray,
  //   email: customerEmail,
  // });

  //create checkout session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    //TEMPORARY: Creating booking documents requires stripe webhooks once app is deployed. Query string workaround is not secure.
    //This should be a special page on the front end that displays a spinner and calls a temp createCheckoutBookings route to call func
    success_url: `${req.protocol}://${process.env.FRONTEND_HOST}/bookings/success/${orderId}`,
    cancel_url: `${req.protocol}://${process.env.FRONTEND_HOST}/events/id/${req.params.eventId}`,
    customer_email: customerEmail, //user email, will be either provided by guest or sent automatically if logged in
    client_reference_id: req.params.eventId,
    line_items: lineItems,
    metadata: {
      user: String(user._id),
      name: req.body.name,
      orderId: String(orderId),
    },
  });

  //send to client
  res.status(200).json({
    status: 'success',
    id: session.id,
  });
});

// exports.createCheckoutBookings = async (req, res, next) => {
//   if (!req.query) return next(new AppError('Invalid checkout session.', 400));

//   //parse query string with qs directly since Express isn't doing it right
//   const { name, event, user, email, tickets } = qs.parse(
//     req.originalUrl.split('?')[1]
//   );

//   if (!event || !email || !tickets || !name)
//     return next(new AppError('Invalid checkout session.', 400));

//   //TEMP: qs bug is putting } at the end of email field
//   let fixedEmail = email.split('');
//   fixedEmail.pop();
//   fixedEmail = fixedEmail.join('');

//   //create bookings
//   const bookings = await Promise.all(
//     tickets.map(async (ticket) => {
//       return Booking.create({
//         event,
//         user,
//         email: fixedEmail,
//         name,
//         ticket: ticket.ticket,
//         price: ticket.price,
//       });
//     })
//   );

//   await new Email(
//     { name, email },
//     `${process.env.FRONTEND_HOST}/bookings/my-bookings/event/${event}`
//   );
//   if (user) {
//     await Email.sendBookingSuccess();
//   } else {
//     await Email.sendBookingSuccessGuest();
//   }

//   res.status(201).json({
//     status: 'success',
//     data: {
//       data: bookings,
//     },
//   });
// };

const createCheckoutBooking = async (session) => {
  const bookings = await Promise.all(
    session.line_items.data.map(async (item) => {
      console.log(item);
      return Booking.create({
        orderId: session.metadata.orderId,
        event: session.client_reference_id,
        user: session.metadata.user,
        email: session.customer_email,
        name: session.metadata.name,
        ticket: item.metadata.ticketId,
        price: item.unit_amount * 0.01,
      });
    })
  );
};

exports.webhookCheckout = async (req, res, next) => {
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    //stripe event does not include line_items- need to retrieve checkout session
    const session = await stripe.checkout.sessions.retrieve(
      event.data.object.id,
      {
        expand: ['line_items'],
      }
    );
    await createCheckoutBooking(session);
  }

  res.status(200).json({ received: true });
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

exports.cancelAllBookings = asyncCatch(async (matchKey, matchValue) => {
  const ticketBookings = await Booking.find({ [matchKey]: matchValue });
  await ticketBookings.forEach(async (booking) => {
    booking.active = false;
    await booking.save();
  });
});

exports.getBookings = asyncCatch(async (req, res, next) => {
  const queryFeatures = new APIFeatures(Booking.find(), req.query)
    .filter()
    .sort();

  if (req.user.role !== 'admin') {
    queryFeatures.query.find({ user: req.user.id, active: true }).populate({
      path: 'event',
      select: 'name dateTimeStart ticketTiers pastEvent',
    });
  }
  const bookings = await queryFeatures.query;

  res.status(200).json({
    status: 'success',
    length: bookings.length,
    data: bookings,
  });
});

exports.getOrder = asyncCatch(async (req, res, next) => {
  //TODO: Make endpoint an aggregation with fields for name, email, event name, number of tickets, and order total
  if (!req.params.id)
    return next(new AppError('Please specify an order ID', 400));

  const bookings = await Booking.find({ orderId: req.params.id }).select(
    'name email event ticket price'
  );

  if (!bookings)
    return next(
      new AppError('No bookings found with specified order ID.', 404)
    );

  res.status(200).json({
    status: 'success',
    length: bookings.length,
    data: bookings,
  });
});

exports.getBooking = factory.getOne(Booking, 'event');
