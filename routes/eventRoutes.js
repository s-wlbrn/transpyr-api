const express = require('express');

const eventController = require('../controllers/event.controller');
const authController = require('../controllers/auth.controller');

const router = express.Router();

router
  .route('/')
  .get(eventController.getAllEvents)
  .post(eventController.createEvent);

router
  .route('/:id')
  .get(eventController.getEvent)
  .patch(eventController.findEventAndUpdate)
  .put(
    eventController.uploadEventPhoto,
    eventController.convertEventPhotoJpeg,
    eventController.updateEvent
  )
  .delete(eventController.deleteEvent);

module.exports = router;
