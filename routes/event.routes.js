const express = require('express');

const eventController = require('../controllers/event.controller');
const authController = require('../controllers/auth.controller');

const router = express.Router();

//Get all events
router.get(
  '/',
  authController.getAttachUser,
  eventController.queryPublishedOnly,
  eventController.getAllEvents
);

//Get one event by id
router.get('/:id', authController.getAttachUser, eventController.getEvent);

//Protect following routes
router.use(authController.protectRoute);

router.get('/me/booked', eventController.getMyBookedEvents);
router.get(
  '/me/managed',
  eventController.queryOwnEvents,
  eventController.getAllEvents
);

//Create event
router.post(
  '/',
  eventController.filterEventBody,
  eventController.attachEventOrganizer,
  eventController.createEvent
);

router
  .route('/:id')
  //Update event
  .put(
    eventController.filterEventBody,
    eventController.getAndAuthorizeEvent,
    eventController.updateAndSaveEvent
  )
  //Upload event photo
  .patch(
    eventController.getAndAuthorizeEvent,
    eventController.uploadEventPhoto,
    eventController.processEventPhoto,
    eventController.updateEvent
  )
  //Delete event
  .delete(eventController.getAndAuthorizeEvent, eventController.cancelEvent);

router.delete(
  '/:id/ticket/:ticketId',
  eventController.getAndAuthorizeEvent,
  eventController.cancelTicket
);

router.patch(
  '/:id/publish',
  eventController.getAndAuthorizeEvent,
  eventController.publishEvent,
  eventController.updateEvent
);
module.exports = router;
