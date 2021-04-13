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
  .patch(eventController.findEventAndUpdate)
  //Upload event photo
  .put(
    eventController.uploadEventPhoto,
    eventController.convertEventPhotoJpeg,
    eventController.updateEvent
  )
  //Delete event
  .delete(eventController.deleteEvent);

module.exports = router;
