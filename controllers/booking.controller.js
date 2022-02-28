const mongoose = require('mongoose');
const Booking = require('../models/booking.model');
const bookingService = require('../services/booking.service');
const eventService = require('../services/event.service');
const AppError = require('../libs/AppError');
const asyncCatch = require('../libs/asyncCatch');
const factory = require('./handlerFactory');

const completeFreeOrder = async (
  req,
  res,
  eventId,
  selectedTickets,
  selectedTicketsMap
) => {
  const session = bookingService.createFreeCheckoutSession(
    req.orderId,
    eventId,
    {
      id: req.user && req.user._id,
      name: req.body.name,
      email: req.customerEmail,
    },
    selectedTickets,
    selectedTicketsMap
  );

  const bookings = await bookingService.createCheckoutBooking(session);
  await bookingService.sendBookingSuccessEmail(
    req.body.name,
    req.customerEmail,
    eventId,
    req.user
  );

  res.status(201).json({
    status: 'success',
    data: {
      bookings,
    },
  });
};

exports.resolveRefundRequest = asyncCatch(async (req, res, next) => {
  const { status } = req.body;
  //req body validation
  if (!['accepted', 'rejected'].includes(status))
    return next(
      new AppError(
        'Please specify a valid status to resolve the refund request.',
        400
      )
    );

  // get booking, populate event
  const bookings = await bookingService.getBookingsByRefundRequest(
    req.params.id
  );

  //handle no bookings
  if (!bookings.length)
    return next(
      new AppError(
        'No bookings with the specified refund request ID were found.',
        404
      )
    );

  //handle unauthorized
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

  //Map edited bookings to array of save promises
  const updatedBookings = await bookingService.updateRefundRequests(
    bookings,
    status
  );

  // create email senders for organizer and attendee
  await bookingService.sendRefundResolvedEmails(
    status,
    bookings[0].event.name,
    req.user,
    { name: bookings[0].name, email: bookings[0].email }
  );

  res.status(200).json({
    status: 'success',
    length: updatedBookings.length,
    data: updatedBookings,
  });
});

exports.requestRefund = asyncCatch(async (req, res, next) => {
  //req body validation
  if (!req.body.selectedIdsArray || !req.body.selectedIdsArray.length)
    return next(new AppError('Please specify bookings to cancel.', 400));

  const bookings = await bookingService.getBookingsToRefund(
    req.user.id,
    req.params.id,
    req.body.selectedIdsArray
  );

  //handle no bookings found
  if (!bookings.length) {
    return next(
      new AppError(
        'No active bookings for the event with the specified IDs were found.',
        404
      )
    );
  }

  //update bookings
  const requestId = await bookingService.addRefundRequests(
    bookings,
    req.body.cancelationReason
  );

  //get event and send email to organizer
  await bookingService.sendRefundEmailOrganizer(req, requestId);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.getRefundRequestById = asyncCatch(async (req, res, next) => {
  const bookings = await bookingService.getRefundRequests({
    'refundRequest.requestId': mongoose.Types.ObjectId(req.params.id),
    'refundRequest.resolved': false,
  });

  if (
    bookings.length &&
    String(bookings[0].event.organizer) !== req.user.id &&
    req.user.role !== 'admin'
  ) {
    return next(new AppError('You are not the organizer of this event.', 403));
  }

  if (!bookings.length) {
    return next(
      new AppError('No refund request with the specified ID was found.', 404)
    );
  }

  res.status(200).json({
    status: 'success',
    length: bookings.length,
    data: bookings,
  });
});

exports.getEventRefundRequests = asyncCatch(async (req, res, next) => {
  const bookings = await bookingService.getRefundRequests({
    event: mongoose.Types.ObjectId(req.params.id),
    'refundRequest.resolved': false,
  });

  if (
    bookings.length &&
    String(bookings[0].event.organizer) !== req.user.id &&
    req.user.role !== 'admin'
  ) {
    return next(new AppError('You are not the organizer of this event.', 403));
  }

  if (!bookings.length) {
    return next(
      new AppError(
        'No refund requests for the event with the specified ID were found.',
        404
      )
    );
  }

  res.status(200).json({
    status: 'success',
    length: bookings.length,
    data: bookings,
  });
});

exports.createValidateCheckout = asyncCatch(async (req, res, next) => {
  //req body validation
  //handle no name
  if (!req.body.name)
    return next(new AppError('A name for the order is required.', 400));
  //get email
  req.customerEmail = req.user ? req.user.email : req.body.email;
  //handle no booking email
  if (!req.customerEmail)
    return next(new AppError('Please specify an email for the booking.', 400));

  const { tickets } = req.body;
  const ticketKeys = Object.keys(tickets);

  //get event to book from params
  req.bookedEvent = await eventService.getEventById(req.params.eventId);
  const { bookedEvent } = req;

  //handle no event
  if (!bookedEvent)
    return next(new AppError('The specified event does not exist.', 404));
  //handle event canceled
  if (bookedEvent.canceled)
    return next(new AppError('The specified event is canceled.', 400));
  //handle event sold out
  if (bookedEvent.soldOut)
    return next(new AppError('The specified event is sold out.', 400));

  //get number of tickets requested and mapped info
  const {
    selectedTicketsCount,
    selectedTicketsMap,
    orderTotal,
  } = bookingService.getSelectedTicketData(tickets, bookedEvent.ticketTiers);

  //handle requested tickets going over capacity
  if (
    bookedEvent.totalCapacity > 0 &&
    selectedTicketsCount + bookedEvent.totalBookings > bookedEvent.totalCapacity
  ) {
    return next(
      new AppError(
        'There are not enough remaining tickets to complete the order.',
        400
      )
    );
  }

  //validate each ticket selection
  for (let i = 0; i < ticketKeys.length; i++) {
    const ticketId = ticketKeys[i];
    const selectedTicket = selectedTicketsMap[ticketId];

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
  }

  //create order ID
  req.orderId = new mongoose.Types.ObjectId();

  //if paid event move on to stripe
  if (orderTotal > 0) {
    req.ticketKeys = ticketKeys;
    req.selectedTicketsMap = selectedTicketsMap;
    return next();
  }

  //if free, create bookings
  await completeFreeOrder(
    req,
    res,
    bookedEvent._id,
    tickets,
    selectedTicketsMap
  );
});

exports.getCheckoutSession = asyncCatch(async (req, res, next) => {
  //destructure order ID
  const { orderId } = req;

  //create Stripe line_items
  const lineItems = bookingService.getStripeLineItems(req);

  //create checkout session
  const session = await bookingService.createStripeCheckoutSession(
    req,
    orderId,
    lineItems
  );

  //send to client
  res.status(200).json({
    status: 'success',
    id: session.id,
  });
});

exports.webhookCheckout = asyncCatch(async (req, res, next) => {
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    event = await bookingService.constructWebhookEvent(req.body, signature);
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    //stripe event does not include line_items- need to retrieve checkout session
    const session = await bookingService.retrieveStripeCheckoutSession(event);

    await bookingService.createCheckoutBooking(session);
    await bookingService.sendBookingSuccessEmail(
      session.metadata.name,
      session.customer_email,
      session.client_reference_id,
      session.metadata.user
    );
  }

  res.status(200).json({ received: true });
});

exports.getOrder = asyncCatch(async (req, res, next) => {
  const bookings = await bookingService.getBookingsByOrderId(req.params.id);

  if (!bookings.length)
    return next(
      new AppError('No bookings found with specified order ID.', 404)
    );

  res.status(200).json({
    status: 'success',
    length: bookings.length,
    data: bookings,
  });
});

exports.getBookings = asyncCatch(async (req, res, next) => {
  const { id, role } = req.user;

  const bookings = await bookingService.getBookings(req.query, {
    activeOnly: role !== 'admin',
    userId: id,
  });

  res.status(200).json({
    status: 'success',
    length: bookings.length,
    data: bookings,
  });
});

exports.getBooking = factory.getOne(Booking, { populate: 'event' });
