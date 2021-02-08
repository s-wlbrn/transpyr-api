const express = require('express');

const eventController = require('../controllers/eventControllers');

const router = express.Router();

router
  .route('/')
  .get(eventController.getAllEvents)
  .post(eventController.uploadEventPhoto, eventController.createEvent);

router
  .route('/:id')
  .get(eventController.getEvent)
  .patch(eventController.updateEvent)
  .delete(eventController.deleteEvent);

module.exports = router;
