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
router.get('/me', eventController.queryOwnEvents, eventController.getAllEvents);

//Create event
router.post(
  '/',
  eventController.attachEventOrganizer,
  eventController.createEvent
);

router
  .route('/:id')
  //Update event
  .put(eventController.getAndAuthorizeEvent, eventController.updateAndSaveEvent)
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

router.put(
  '/:id/publish-event',
  eventController.getAndAuthorizeEvent,
  eventController.publishEvent,
  eventController.updateEvent
);
module.exports = router;
