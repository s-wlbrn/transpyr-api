const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Event = require('../models/event.model');
const Booking = require('../models/booking.model');
const factory = require('./handlerFactory');
const AppError = require('../libs/AppError');
const asyncCatch = require('../libs/asyncCatch');

exports.getCheckoutSession = asyncCatch(async (res, req, next) => {
  //get event to book from params
  const event = await Event.findById(req.params.eventId);

  //create checkout session
  const session = await stripe.checkout.session.create({
    payment_method_types: ['card'],
    //TEMPORARY: Creating booking documents requires stripe webhooks once app is deployed. Query string workaround is not secure.
    //This should be a special page on the front end that displays a spinner and calls a temp createCheckoutBookings route to call func
    success_url: `${req.protocol}://${process.env.FRONTEND_HOST}/events?event=${req.params.eventId}&user=${req.body.user}&tickets=${req.body.tickets}`,
    cancel_url: `${req.protocol}://${process.env.FRONTEND_HOST}/events/${req.params.eventId}`,
    customer_email: '', //user email, will be either provided by guest or sent automatically if logged in
    client_reference_id: req.params.eventId,
    line_items: [
      {
        name: `${event.name}`,
        description: '',
        images: '',
        // amount: price * 100
        currency: 'usd',
        // quantity: quantity
      },
    ],
  });

  //send to client
  res.status(200).json({
    status: 'success',
    session,
  });
});

exports.createCheckoutBookings = async (req, res, next) => {
  const { event, user, tickets } = req.query;

  if (!event || !user || !tickets) return next();

  /* from front end
    array with ticket for each quantity
    event: event
    user: user if user
    email: email from stripe
    tickets: array
      [
        name,
        ticket: ticket obj
      ]
      
  */

  //forEach ticket in tickets
  /* create Booking object
    event: id,
    user: id or nuthin,
    email: email || user.email,
    name: ticket.name,
    ticket: ticket.ticket,
    price: ticket.price,
  */

  //await Booking.create(event, user, ticket);
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
