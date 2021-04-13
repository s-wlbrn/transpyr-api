const express = require('express');
const bookingController = require('../controllers/booking.controller');
const authController = require('../controllers/auth.controller');

const router = express.Router();

router.get(
  '/checkout-session/:eventId',
  authController.protectRoute,
  bookingController.getCheckoutSession
);

router.get(
  '/checkout-create-booking',
  bookingController.createCheckoutBookings
);

router.post('/create-bookings', bookingController.createBookings);

module.exports = router;
