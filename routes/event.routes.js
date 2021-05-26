const express = require('express');

const eventController = require('../controllers/event.controller');
const authController = require('../controllers/auth.controller');

const router = express.Router();

//Get all events
router.get('/', eventController.getAllEvents);

//Get one event by id
router.get('/:id', eventController.getEvent);

//Protect following routes
router.use(authController.protectRoute);

//Create event
router.post(
  '/',
  eventController.attachEventOrganizer,
  eventController.createEvent
);

router
  .route('/:id')
  //Update event
  .put(eventController.getAndAuthorizeEvent, eventController.findEventAndUpdate)
  //Upload event photo
  .patch(
    eventController.getAndAuthorizeEvent,
    eventController.uploadEventPhoto,
    eventController.convertEventPhotoJpeg,
    eventController.updateEvent
  )
  //Delete event
  .delete(eventController.deleteEvent);

router.put(
  '/:id/publish-event',
  eventController.getAndAuthorizeEvent,
  eventController.publishEvent,
  eventController.updateEvent
);
module.exports = router;
