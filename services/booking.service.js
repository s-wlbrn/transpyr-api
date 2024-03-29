const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mongoose = require('mongoose');
const Booking = require('../models/booking.model');
const Email = require('./email.service');
const APIFeatures = require('../libs/apiFeatures');

//Emails
exports.sendRefundEmailOrganizer = async (url, organizer, requestId) => {
  await new Email(organizer, url).sendCancelationRequestOrganizer();
};

exports.sendRefundResolvedEmails = async (
  status,
  eventName,
  organizer,
  attendee
) => {
  const emailOrganizer = new Email(organizer, null, eventName);
  const emailAttendee = new Email(
    { name: attendee.name, email: attendee.email },
    null,
    eventName
  );
  //send emails
  if (status === 'accepted') {
    await Promise.all([
      emailOrganizer.sendCancelationRequestAcceptedOrganizer(),
      emailAttendee.sendCancelationRequestAcceptedAttendee(),
    ]);
  } else {
    //email rejected
    await emailAttendee.sendCancelationRequestRejectedAttendee();
  }
};

exports.sendBookingSuccessEmail = async (name, email, url, user) => {
  try {
    const mailer = await new Email({ name, email }, url);
    if (user) {
      await mailer.sendBookingSuccess();
    } else {
      await mailer.sendBookingSuccessGuest();
    }
  } catch (err) {
    return Promise.reject(err);
  }
};

//Queries
exports.getBookings = async (query, { activeOnly = true, userId }) => {
  const queryFeatures = new APIFeatures(Booking.find(), query).filter().sort();

  if (activeOnly) {
    queryFeatures.query.find({ user: userId, active: true }).populate({
      path: 'event',
      select: 'name dateTimeStart ticketTiers pastEvent',
    });
  }

  const bookings = await queryFeatures.query;
  return bookings;
};

exports.getBookingById = async (id) => {
  const booking = await Booking.findById(id);
  return booking;
};

exports.getUserBookedEventsWithTotals = async (userId) => {
  const bookings = await Booking.aggregate([
    { $match: { user: userId, active: true } },
    { $project: { event: 1 } },
    { $group: { _id: '$event', total: { $sum: 1 } } },
  ]);

  return bookings;
};

exports.getBookingsByOrderId = async (orderId) => {
  const bookings = await Booking.find({ orderId }).select(
    'name email event ticket price'
  );

  return bookings;
};

exports.getBookingsByRefundRequest = async (requestId) => {
  const bookings = await Booking.find({
    'refundRequest.requestId': requestId,
    'refundRequest.resolved': false,
  }).populate({ path: 'event', select: 'organizer name' });

  return bookings;
};

exports.getBookingsToRefund = async (userId, eventId, selectedTicketIds) => {
  const bookings = await Booking.find({
    user: userId,
    event: eventId,
    active: true,
    refundRequest: { $exists: false },
    _id: { $in: selectedTicketIds },
  });

  return bookings;
};

exports.getRefundRequests = async (query) => {
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
        requestId: { $first: '$refundRequest.requestId' },
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

exports.cancelAllBookings = async (matchKey, matchValue) => {
  const ticketBookings = await Booking.find({ [matchKey]: matchValue });
  const ticketPromises = ticketBookings.map((booking) => {
    booking.active = false;
    return booking.save();
  });
  await Promise.all(ticketPromises);
};

exports.createCheckoutBooking = async (session) => {
  try {
    const bookings = await Promise.all(
      session.line_items.data.map(async (item) => {
        return Booking.create({
          orderId: session.metadata.orderId,
          event: session.client_reference_id,
          user: session.metadata.user,
          email: session.customer_email,
          name: session.metadata.name,
          ticket: item.price.product.metadata.ticketId,
          price: Number(item.price.unit_amount) * 0.01,
        });
      })
    );

    return bookings;
  } catch (err) {
    return Promise.reject(err);
  }
};

exports.updateRefundRequests = async (bookings, status) => {
  const updatedBookingsPromises = bookings.map((booking) => {
    booking.refundRequest.status = status;
    booking.refundRequest.resolved = true;
    if (status === 'accepted') {
      booking.active = false;
    }
    return booking.save();
  });
  //update bookings
  const updatedBookings = await Promise.all(updatedBookingsPromises);
  return updatedBookings;
};

exports.addRefundRequests = async (bookings, reason) => {
  //create uuid for refund request
  const requestId = mongoose.Types.ObjectId();
  //map bookings with refundRequest added, return array of promises
  const updatedBookingsPromises = bookings.map((booking) => {
    if (booking.price) {
      booking.refundRequest = {
        requestId,
        reason,
        resolved: false,
      };
    } else {
      booking.active = false;
    }
    return booking.save();
  });
  //update bookings
  await Promise.all(updatedBookingsPromises);

  return requestId;
};

//Helpers
exports.getSelectedTicketData = (selectedTickets, eventTickets) => {
  const ticketKeys = Object.keys(selectedTickets);

  const selectedTicketsCount = ticketKeys.reduce(
    (acc, cur) => acc + selectedTickets[cur],
    0
  );

  const selectedTicketsMap = ticketKeys.reduce((acc, ticketId) => {
    const ticket = eventTickets.find((el) => el.id === ticketId);
    return { ...acc, [ticketId]: ticket };
  }, {});

  const orderTotal = ticketKeys.reduce((acc, ticketId) => {
    const ticket = selectedTicketsMap[ticketId];

    return acc + ticket.price * selectedTickets[ticketId];
  }, 0);

  return {
    selectedTicketsCount,
    selectedTicketsMap,
    orderTotal,
  };
};

exports.createFreeCheckoutSession = (
  orderId,
  eventId,
  customer,
  selectedTickets,
  selectedTicketsMap
) => {
  const ticketKeys = Object.keys(selectedTickets);
  //mimic stripe session data
  const session = {
    metadata: {
      orderId: orderId,
      user: customer.id,
      name: customer.name,
    },
    client_reference_id: eventId,
    customer_email: customer.email,
    line_items: {
      data: ticketKeys.flatMap((ticketId) => {
        const individualBookings = [];
        // create booking objects with ticket id and price according to quantity
        for (let i = 0; i < selectedTickets[ticketId]; ++i) {
          individualBookings.push({
            price: {
              product: {
                metadata: {
                  ticketId,
                },
              },
              unit_amount: selectedTicketsMap[ticketId].price * 100,
            },
          });
        }
        return individualBookings;
      }),
    },
  };

  return session;
};

exports.getStripeLineItems = (req) => {
  const lineItems = req.ticketKeys.map((ticketId) => {
    const selectedTicket = req.selectedTicketsMap[ticketId];
    return {
      price_data: {
        currency: 'usd',
        unit_amount:
          req.bookedEvent.feePolicy === 'passFee'
            ? Math.floor(selectedTicket.price * 1.03 * 100)
            : selectedTicket.price * 100,
        product_data: {
          name: `${req.bookedEvent.name}: ${selectedTicket.tierName}`,
          description: selectedTicket.tierDescription,
          metadata: {
            ticketId: String(selectedTicket._id),
          },
        },
      },
      quantity: req.body.tickets[ticketId],
    };
  });

  return lineItems;
};

//Stripe
exports.createStripeCheckoutSession = async (req, orderId, lineItems) => {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    success_url: `${req.protocol}://${process.env.FRONTEND_HOST}/bookings/success/${orderId}`,
    cancel_url: `${req.protocol}://${process.env.FRONTEND_HOST}/events/id/${req.params.eventId}`,
    customer_email: req.customerEmail, //user email, will be either provided by guest or sent automatically if logged in
    client_reference_id: req.params.eventId,
    line_items: lineItems,
    metadata: {
      user: req.user ? String(req.user._id) : undefined,
      name: req.body.name,
      orderId: String(orderId),
    },
  });

  return session;
};

exports.constructWebhookEvent = async (body, signature) => {
  const event = stripe.webhooks.constructEvent(
    body,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );

  return event;
};

exports.retrieveStripeCheckoutSession = async (event) => {
  const session = await stripe.checkout.sessions.retrieve(
    event.data.object.id,
    {
      expand: ['line_items', 'line_items.data.price.product'],
    }
  );

  return session;
};
