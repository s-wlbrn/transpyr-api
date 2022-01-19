const testApp = require('../test/testApp');
const mongoose = require('mongoose');
const db = require('../test/db');
const Booking = require('../models/booking.model');
const { createUserAndLogin } = require('../test/authHelpers');

beforeAll(async () => {
  await db.connect();
});

afterEach(async () => {
  await db.clearDatabase();
});

afterAll(async () => {
  await db.closeDatabase();
});

// describe('refund requests', () => {
//   it('can be created on an active booking', async () => {});

//   it('sends an error if no booking is specified', async () => {});
// })

describe('bookings', () => {
  describe('getting by order ID', () => {
    it('can be retrieved with an order ID', async () => {
      const orderId = mongoose.Types.ObjectId();
      const user = mongoose.Types.ObjectId();
      const event = mongoose.Types.ObjectId();
      await Booking.bulkWrite([
        {
          insertOne: {
            document: {
              orderId,
              name: 'Test Tester',
              email: 'test@tester.com',
              user,
              event,
              ticket: mongoose.Types.ObjectId(),
              price: 20,
            },
          },
        },
        {
          insertOne: {
            document: {
              orderId,
              name: 'Test Tester',
              email: 'test@tester.com',
              user,
              event,
              ticket: mongoose.Types.ObjectId(),
              price: 10,
            },
          },
        },
      ]);

      const response = await testApp().get(`/api/bookings/order/${orderId}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.length).toBe(2);
    });

    it('sends 400 error on invalid order ID', async () => {
      const response = await testApp().get('/api/bookings/order/malformed');
      expect(response.statusCode).toBe(400);
    });

    it('sends 404 error when no bookings found', async () => {
      const orderId = mongoose.Types.ObjectId();
      const response = await testApp().get(`/api/bookings/order/${orderId}`);
      expect(response.statusCode).toBe(404);
    });
  });
});
