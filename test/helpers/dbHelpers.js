const User = require('../../models/user.model');
const Event = require('../../models/event.model');
const Booking = require('../../models/booking.model');

const setupDocuments = (Model) => async (documents) => {
  if (!Array.isArray(documents) || documents.length === 1) {
    return await Model.create(documents);
  }

  const formattedDocuments = documents.map((doc) => {
    return {
      insertOne: {
        document: {
          ...doc,
        },
      },
    };
  });

  const docs = await Model.bulkWrite(formattedDocuments);
  return docs;
};

exports.setupUsers = setupDocuments(User);
exports.setupEvents = setupDocuments(Event);
exports.setupBookings = setupDocuments(Booking);
