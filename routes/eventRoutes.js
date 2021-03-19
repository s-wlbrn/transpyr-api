const express = require('express');

const eventController = require('../controllers/eventController');
const authController = require('../controllers/authController');

const router = express.Router();

router
  .route('/')
  .get(eventController.getAllEvents)
  .post(eventController.createEvent);

router
  .route('/:id')
  .get(eventController.getEvent)
  .patch(
    eventController.uploadEventPhoto,
    eventController.convertEventPhotoJpeg,
    eventController.updateEvent
  )
  .delete(eventController.deleteEvent);

module.exports = router;
