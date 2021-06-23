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

router.use(authController.protectRoute);

router.get('/me', bookingController.getBookings);

router
  .route('/refund-request/:id')
  .get(bookingController.getRefundRequestById)
  .patch(bookingController.resolveRefundRequest);

router
  .route('/refund-request/event/:id')
  .get(bookingController.getEventRefundRequests)
  .patch(bookingController.requestRefund);

module.exports = router;
