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
  .route('/refund-requests/:id')
  .get(bookingController.getRefundRequestById)
  .patch(bookingController.resolveRefundRequest);

router
  .route('/refund-requests/event/:id')
  .get(bookingController.getEventRefundRequests)
  .patch(bookingController.requestRefund);

router.use(authController.authorizeRole('admin'));

router
  .route('/:id')
  .get(bookingController.getBooking)
  .post(bookingController.createBookings);
router.get('/', bookingController.getBookings);

module.exports = router;
