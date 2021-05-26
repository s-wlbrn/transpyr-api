const express = require('express');
const bookingController = require('../controllers/booking.controller');
const authController = require('../controllers/auth.controller');

const router = express.Router();

router.post(
  '/checkout-session/:eventId',
  //authController.protectRoute,
  bookingController.getCheckoutSession
);

router.get(
  '/checkout-create-booking',
  bookingController.createCheckoutBookings
);

module.exports = router;
