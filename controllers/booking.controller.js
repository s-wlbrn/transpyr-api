const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const qs = require('qs');
const Event = require('../models/event.model');
const User = require('../models/user.model');
const Booking = require('../models/booking.model');
const factory = require('./handlerFactory');
const AppError = require('../libs/AppError');
const asyncCatch = require('../libs/asyncCatch');

exports.getCheckoutSession = asyncCatch(async (req, res, next) => {
  const { tickets } = req.body;

  //get event to book from params
  const event = await Event.findById(req.params.eventId);

  //handle no event
  if (!event)
    return next(new AppError('The specified event does not exist.', 404));

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
  const ticketKeys = Object.keys(tickets);
  const ticketTiersMap = ticketKeys.reduce((acc, ticketId) => {
    const ticket = event.ticketTiers.find((el) => el.id === ticketId);
    return { ...acc, [ticketId]: { ...ticket._doc } };
  }, {});

  //Create line_items object for Stripe
  const lineItems = ticketKeys.map((ticketId) => {
    return {
      name: `${event.name}: ${ticketTiersMap[ticketId].tierName}`,
      description: ticketTiersMap[ticketId].tierDescription,
      //  images: ''
      amount: ticketTiersMap[ticketId].price * 100,
      currency: 'usd',
      quantity: tickets[ticketId].quantity,
    };
  });

  //Create tickets array for booking documents
  const ticketsArray = ticketKeys.flatMap((ticketId) =>
    tickets[ticketId].bookings.map((booking) => {
      return {
        ...booking,
        user: user.id,
        bookingEmail: customerEmail,
        event: req.params.eventId,
        ticket: ticketId,
        price: ticketTiersMap[ticketId].price,
      };
    })
  );

  //TEMP: Stringify the object to send to createCheckoutBookings as a query string
  const queryString = qs.stringify({
    event: req.params.eventId,
    user: user.id,
    tickets: ticketsArray,
    email: customerEmail,
  });

  console.log(qs.parse(queryString));

  //create checkout session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    //TEMPORARY: Creating booking documents requires stripe webhooks once app is deployed. Query string workaround is not secure.
    //This should be a special page on the front end that displays a spinner and calls a temp createCheckoutBookings route to call func
    success_url: `${req.protocol}://${process.env.FRONTEND_HOST}/bookings/create?${queryString}`,
    cancel_url: `${req.protocol}://${process.env.FRONTEND_HOST}/events/${req.params.eventId}`,
    customer_email: customerEmail, //user email, will be either provided by guest or sent automatically if logged in
    client_reference_id: req.params.eventId,
    line_items: lineItems,
  });

  //send to client
  res.status(200).json({
    status: 'success',
    session,
  });
});

exports.createCheckoutBookings = async (req, res, next) => {
  if (!req.query) return next(new AppError('Invalid checkout session.', 400));

  const { event, user, email, tickets } = qs.parse(
    req.originalUrl.split('?')[1]
  );

  if (!event || !email || !tickets) return next();

  const bookings = await Promise.all(
    tickets.map(async (ticket) => {
      return Booking.create({
        event,
        user,
        bookingEmail: email,
        name: ticket.name,
        email: ticket.email,
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
  const { event, user, email, tickets } = req.body;

  const bookings = await Promise.all(
    tickets.map(async (ticket) => {
      return await Booking.create({
        event,
        user,
        email,
        name: ticket.name,
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
