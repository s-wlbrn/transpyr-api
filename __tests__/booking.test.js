const mongoose = require('mongoose');
const { Stripe } = require('stripe');
const testApp = require('../test/testApp');
const Booking = require('../models/booking.model');
const Event = require('../models/event.model');
const User = require('../models/user.model');
const Email = require('../services/email.service');
const {
  createAdminAndLogin,
  createUserAndLogin,
  createGuest,
} = require('../test/helpers/authHelpers');
const {
  clearTestMailbox,
  getTestEmails,
} = require('../test/helpers/emailHelpers');

const setupEventAndOrganizer = async ({
  login = false,
  overrides = {},
} = {}) => {
  const organizer = await User.create({
    name: 'Test Organizer',
    email: 'test@organizer.com',
    password: 'testpassword',
    passwordConfirm: 'testpassword',
  });
  const defaultEvent = {
    name: 'Test Event',
    organizer: organizer._id,
    dateTimeStart: new Date(Date.now() + 3600000),
    dateTimeEnd: new Date(Date.now() + 7200000),
    type: 'Lecture',
    category: 'Music',
    description: 'Test description',
    totalCapacity: 10,
    feePolicy: 'absorbFee',
    published: true,
    ticketTiers: [
      {
        tierName: 'General Admission',
        tierDescription: 'General Admission',
        limitPerCustomer: 1,
        online: true,
        price: 100,
        capacity: 10,
      },
    ],
  };
  const eventData = { ...defaultEvent, ...overrides };
  const event = await Event.create(eventData);

  let token;
  if (login) {
    const response = await testApp().post('/api/users/signin').send({
      email: organizer.email,
      password: 'testpassword',
    });
    ({ token } = response.body);
  }
  return { organizer, event, token };
};

const setupBookings = async (documents) => {
  const formattedDocuments = documents.map((doc) => {
    return {
      insertOne: {
        document: {
          ...doc,
        },
      },
    };
  });

  const bookings = await Booking.bulkWrite(formattedDocuments);
  return bookings;
};

describe('refund requests', () => {
  describe('creating request', () => {
    beforeAll(async () => {
      await clearTestMailbox();
    });

    afterAll(async () => {
      await clearTestMailbox();
    });

    it('creates refund requests for active bookings, emails organizer', async () => {
      const refundMailer = jest.spyOn(
        Email.prototype,
        'sendCancelationRequestOrganizer'
      );
      //create user
      const { user, token } = await createUserAndLogin();
      //create events
      const { organizer, event } = await setupEventAndOrganizer();
      //create bookings for user, two active, one cancelled, one for different event, one with existing refund request, one not belonging to user
      const orderId = mongoose.Types.ObjectId();
      const existingRequestBookingId = mongoose.Types.ObjectId();
      const existingRequestId = mongoose.Types.ObjectId();
      const testBookings = await setupBookings([
        {
          orderId,
          name: user.name,
          email: user.email,
          user: user._id,
          event: event._id,
          ticket: mongoose.Types.ObjectId(),
          price: 20,
        },
        {
          orderId,
          name: user.name,
          email: user.email,
          user: user._id,
          event: event._id,
          ticket: mongoose.Types.ObjectId(),
          price: 10,
        },
        {
          orderId: mongoose.Types.ObjectId(),
          name: user.name,
          email: user.email,
          user: user._id,
          event: event._id,
          ticket: mongoose.Types.ObjectId(),
          price: 10,
          active: false,
        },
        {
          orderId: mongoose.Types.ObjectId(),
          name: user.name,
          email: user.email,
          user: user._id,
          event: mongoose.Types.ObjectId(),
          ticket: mongoose.Types.ObjectId(),
          price: 10,
        },
        {
          orderId: existingRequestBookingId,
          name: user.name,
          email: user.email,
          user: user._id,
          event: event._id,
          ticket: mongoose.Types.ObjectId(),
          price: 10,
          refundRequest: {
            requestId: existingRequestId,
            resolved: false,
          },
        },
        {
          orderId: mongoose.Types.ObjectId(),
          name: 'Other User',
          email: 'other@user.com',
          user: mongoose.Types.ObjectId(),
          event,
          ticket: mongoose.Types.ObjectId(),
          price: 10,
        },
      ]);
      const selectedIdsArray = Object.values(testBookings.insertedIds);

      const response = await testApp()
        .patch(`/api/bookings/refund-requests/event/${event._id}`)
        .send({ selectedIdsArray })
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(204);

      //expect email sent
      expect(refundMailer).toHaveBeenCalledTimes(1);
      //get email from mailtrap
      const testEmails = await getTestEmails();
      expect(testEmails.length).toBe(1);
      expect(testEmails[0].to_email).toBe(organizer.email);
      expect(testEmails[0].subject).toEqual(expect.stringMatching(/request/i));

      //get all bookings, loop through
      const bookings = await Booking.find();
      bookings.forEach((booking) => {
        //for booking with existing refund request, expect refund request to be unchanged
        if (
          booking.orderId.toString() === existingRequestBookingId.toString()
        ) {
          expect(booking.refundRequest.requestId.toString()).toBe(
            existingRequestId.toString()
          );
        } else if (booking.refundRequest) {
          expect(booking.user.toString()).toBe(user._id.toString());
          expect(booking.active).toBe(true);
          expect(booking.event.toString()).toBe(event._id.toString());
        }
      });
    });

    it('cancels free ticket without creating refund request', async () => {
      jest
        .spyOn(Email.prototype, 'sendCancelationRequestOrganizer')
        .mockImplementation(() => {});

      //create free event
      const { event } = await setupEventAndOrganizer({
        overrides: {
          ticketTiers: [
            {
              tierName: 'General Admission',
              tierDescription: 'General Admission',
              limitPerCustomer: 1,
              online: true,
              price: 0,
              capacity: 10,
            },
          ],
        },
      });

      const { user, token } = await createUserAndLogin();
      const booking = await Booking.create({
        orderId: mongoose.Types.ObjectId(),
        name: user.name,
        email: user.email,
        user: user._id,
        event: event._id,
        ticket: event.ticketTiers[0]._id,
        price: 0,
      });

      //request
      const selectedIdsArray = [booking._id];
      const response = await testApp()
        .patch(`/api/bookings/refund-requests/event/${event._id}`)
        .send({ selectedIdsArray })
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(204);

      const resultBooking = await Booking.findById(booking._id);
      expect(resultBooking.refundRequest).toBe(undefined);
      expect(resultBooking.active).toBe(false);
    });

    //returns 404 for no active bookings
    it('returns 404 for no active bookings', async () => {
      const { token } = await createUserAndLogin();
      const eventId = mongoose.Types.ObjectId();
      const selectedIdsArray = [
        mongoose.Types.ObjectId(),
        mongoose.Types.ObjectId(),
      ];
      const response = await testApp()
        .patch(`/api/bookings/refund-requests/event/${eventId}`)
        .send({ selectedIdsArray })
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(404);
    });

    it('returns 400 if no bookings are specified', async () => {
      const { token } = await createUserAndLogin();
      const eventId = mongoose.Types.ObjectId();
      const response = await testApp()
        .patch(`/api/bookings/refund-requests/event/${eventId}`)
        .send({ selectedIdsArray: [] })
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(400);
    });
  });

  describe('resolving request', () => {
    beforeEach(async () => {
      await clearTestMailbox();
    });

    afterEach(async () => {
      await clearTestMailbox();
    });

    const createTestBookings = async (event, requestId) => {
      const orderId = mongoose.Types.ObjectId();
      return await setupBookings([
        {
          orderId,
          name: 'Tester',
          email: 'tester@test.com',
          user: mongoose.Types.ObjectId(),
          event: event._id,
          ticket: event.ticketTiers[0]._id,
          price: event.ticketTiers[0].price,
          refundRequest: {
            requestId,
            resolved: false,
          },
        },
        {
          orderId,
          name: 'Tester',
          email: 'tester@test.com',
          user: mongoose.Types.ObjectId(),
          event: event._id,
          ticket: event.ticketTiers[0]._id,
          price: event.ticketTiers[0].price,
          refundRequest: {
            requestId,
            resolved: false,
          },
        },
      ]);
    };

    it('accepts request and cancels bookings if user is organizer', async () => {
      const attendeeMailer = jest.spyOn(
        Email.prototype,
        'sendCancelationRequestAcceptedAttendee'
      );
      const organizerMailer = jest.spyOn(
        Email.prototype,
        'sendCancelationRequestAcceptedOrganizer'
      );
      //create event and organizer
      const { token, organizer, event } = await setupEventAndOrganizer({
        login: true,
      });
      //create bookings with refund request
      const requestId = mongoose.Types.ObjectId();
      await createTestBookings(event, requestId);

      //resolve request
      const response = await testApp()
        .patch(`/api/bookings/refund-requests/${requestId}`)
        .send({ status: 'accepted' })
        .auth(token, { type: 'bearer' });

      //emails
      expect(attendeeMailer).toHaveBeenCalledTimes(1);
      expect(organizerMailer).toHaveBeenCalledTimes(1);
      const testEmails = await getTestEmails();
      expect(testEmails.length).toBe(2);
      testEmails.forEach((email) => {
        expect([organizer.email, 'tester@test.com']).toContain(email.to_email);
        expect(email.subject).toEqual(expect.stringMatching(/accepted/i));
      });

      expect(response.status).toBe(200);
      response.body.data.forEach((booking) => {
        expect(booking.refundRequest.resolved).toBe(true);
        expect(booking.refundRequest.status).toBe('accepted');
        expect(booking.active).toBe(false);
      });
    });

    it('rejects request if user is organizer', async () => {
      const attendeeMailer = jest.spyOn(
        Email.prototype,
        'sendCancelationRequestRejectedAttendee'
      );
      //create event and organizer
      const { token, event } = await setupEventAndOrganizer({
        login: true,
      });
      //create bookings with refund request
      const requestId = mongoose.Types.ObjectId();
      await createTestBookings(event, requestId);

      //resolve request
      const response = await testApp()
        .patch(`/api/bookings/refund-requests/${requestId}`)
        .send({ status: 'rejected' })
        .auth(token, { type: 'bearer' });

      //emails
      expect(attendeeMailer).toHaveBeenCalledTimes(1);
      const testEmails = await getTestEmails();
      expect(testEmails.length).toBe(1);
      expect(testEmails[0].to_email).toEqual('tester@test.com');
      expect(testEmails[0].subject).toEqual(expect.stringMatching(/rejected/i));

      expect(response.status).toBe(200);
      response.body.data.forEach((booking) => {
        expect(booking.refundRequest.resolved).toBe(true);
        expect(booking.refundRequest.status).toBe('rejected');
        expect(booking.active).toBe(true);
      });
    });

    it('returns 400 if no request status is specified', async () => {
      const { token, event } = await setupEventAndOrganizer({
        login: true,
      });
      //create bookings with refund request
      const requestId = mongoose.Types.ObjectId();
      await createTestBookings(event, requestId);

      //resolve request
      const response = await testApp()
        .patch(`/api/bookings/refund-requests/${requestId}`)
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(400);
    });

    test('returns 403 if user is not organizer or admin', async () => {
      const { token } = await createUserAndLogin();
      const { event } = await setupEventAndOrganizer();
      //create bookings with refund request
      const requestId = mongoose.Types.ObjectId();
      await createTestBookings(event, requestId);

      //resolve request
      const response = await testApp()
        .patch(`/api/bookings/refund-requests/${requestId}`)
        .send({ status: 'accepted' })
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(403);
    });

    it('returns 404 if request is not found', async () => {
      const { token } = await setupEventAndOrganizer({
        login: true,
      });
      const fakeRequestId = mongoose.Types.ObjectId();

      const response = await testApp()
        .patch(`/api/bookings/refund-requests/${fakeRequestId}`)
        .send({ status: 'accepted' })
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(404);
    });

    it('returns 401 if user is not logged in', async () => {
      const requestId = mongoose.Types.ObjectId();

      const response = await testApp()
        .patch(`/api/bookings/refund-requests/${requestId}`)
        .send({ status: 'accepted' });

      expect(response.status).toBe(401);
    });
  });

  describe('getting requests by event', () => {
    const createTestBookings = async (event) => {
      const testBookings = await setupBookings([
        {
          orderId: mongoose.Types.ObjectId(),
          name: 'Tester One',
          email: 'testerone@test.com',
          user: mongoose.Types.ObjectId(),
          event: event._id,
          ticket: event.ticketTiers[0]._id,
          price: event.ticketTiers[0].price,
        },
        {
          orderId: mongoose.Types.ObjectId(),
          name: 'Tester Two',
          email: 'testertwo@test.com',
          user: mongoose.Types.ObjectId(),
          event: event._id,
          ticket: event.ticketTiers[0]._id,
          price: event.ticketTiers[0].price,
          refundRequest: {
            requestId: mongoose.Types.ObjectId(),
            resolved: false,
          },
        },
        {
          orderId: mongoose.Types.ObjectId(),
          name: 'Tester Three',
          email: 'testerthree@test.com',
          user: mongoose.Types.ObjectId(),
          event: event._id,
          ticket: event.ticketTiers[0]._id,
          price: event.ticketTiers[0].price,
          refundRequest: {
            requestId: mongoose.Types.ObjectId(),
            resolved: true,
            status: 'accepted',
          },
        },
        {
          orderId: mongoose.Types.ObjectId(),
          name: 'Tester Three',
          email: 'testerthree@test.com',
          user: mongoose.Types.ObjectId(),
          event: mongoose.Types.ObjectId(),
          ticket: mongoose.Types.ObjectId(),
          price: 20,
          refundRequest: {
            requestId: mongoose.Types.ObjectId(),
            resolved: false,
          },
        },
      ]);
      return testBookings;
    };

    it('returns unresolved refund requests for event if user is organizer or admin', async () => {
      //setup event and organizer
      const admin = await createAdminAndLogin();
      const { event, token } = await setupEventAndOrganizer({ login: true });
      //create bookings, one with no request, one with request, one with resolved request, one for different event
      await createTestBookings(event);

      const tokens = [token, admin.token];
      const responses = tokens.map((t) => {
        return testApp()
          .get(`/api/bookings/refund-requests/event/${event._id}`)
          .auth(t, { type: 'bearer' });
      });

      await Promise.all(responses);
      responses.forEach(({ response }) => {
        expect(response.status).toBe(200);
        expect(response.body.data.length).toBe(1);
        expect(response.body.data[0].name).toBe('Tester Two');
      });
    });

    it('returns 404 if no requests for event', async () => {
      const { event, token } = await setupEventAndOrganizer({ login: true });
      await Booking.create({
        orderId: mongoose.Types.ObjectId(),
        name: 'Tester',
        email: 'test@test.com',
        user: mongoose.Types.ObjectId(),
        event: event._id,
        ticket: event.ticketTiers[0]._id,
        price: event.ticketTiers[0].price,
      });

      const response = await testApp()
        .get(`/api/bookings/refund-requests/event/${event._id}`)
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(404);
    });

    it('returns 403 if not organizer or admin', async () => {
      const { token } = await createUserAndLogin();
      const { event } = await setupEventAndOrganizer({ login: true });
      //create bookings, one with no request, one with request, one with resolved request, one for different event
      await createTestBookings(event);

      //get requests
      const response = await testApp()
        .get(`/api/bookings/refund-requests/event/${event._id}`)
        .auth(token, { type: 'bearer' });

      //expect requests
      expect(response.status).toBe(403);
    });

    it('returns 401 if not logged in', async () => {
      const event = mongoose.Types.ObjectId();
      const response = await testApp().get(
        `/api/bookings/refund-requests/event/${event}`
      );

      expect(response.status).toBe(401);
    });
  });

  describe('getting requests by requestId', () => {
    //create bookings, one with request, three with same request id, one of them resolved, one of them different event
    const createTestBookings = async (event, requestId) => {
      const testBookings = await setupBookings([
        {
          orderId: mongoose.Types.ObjectId(),
          name: 'Tester One',
          email: 'testerone@test.com',
          user: mongoose.Types.ObjectId(),
          event: event._id,
          ticket: event.ticketTiers[0]._id,
          price: event.ticketTiers[0].price,
          refundRequest: {
            requestId: mongoose.Types.ObjectId(),
            resolved: false,
          },
        },
        {
          orderId: mongoose.Types.ObjectId(),
          name: 'Tester Two',
          email: 'testertwo@test.com',
          user: mongoose.Types.ObjectId(),
          event: event._id,
          ticket: event.ticketTiers[0]._id,
          price: event.ticketTiers[0].price,
          refundRequest: {
            requestId,
            resolved: false,
          },
        },
        {
          orderId: mongoose.Types.ObjectId(),
          name: 'Tester Two',
          email: 'testerthree@test.com',
          user: mongoose.Types.ObjectId(),
          event: event._id,
          ticket: event.ticketTiers[0]._id,
          price: event.ticketTiers[0].price,
          refundRequest: {
            requestId: mongoose.Types.ObjectId(),
            resolved: true,
            status: 'accepted',
          },
        },
        {
          orderId: mongoose.Types.ObjectId(),
          name: 'Tester Two',
          email: 'testertwo@test.com',
          user: mongoose.Types.ObjectId(),
          event: event._id,
          ticket: event.ticketTiers[0]._id,
          price: event.ticketTiers[0].price,
          refundRequest: {
            requestId,
            resolved: false,
          },
        },
      ]);
      return testBookings;
    };

    it('returns bookings with requests matching id if user is organizer or admin', async () => {
      //setup event and organizer
      const admin = await createAdminAndLogin();

      const { event, token } = await setupEventAndOrganizer({ login: true });
      //create bookings, one with no request, three with same request id, one of them resolved
      const requestId = mongoose.Types.ObjectId();
      await createTestBookings(event, requestId);

      const tokens = [token, admin.token];
      const responses = tokens.map((t) => {
        return testApp()
          .get(`/api/bookings/refund-requests/${requestId}`)
          .auth(t, { type: 'bearer' });
      });

      await Promise.all(responses);
      responses.forEach(({ response }) => {
        //expect requests
        expect(response.status).toBe(200);
        expect(response.body.data[0].tickets.length).toBe(2);
      });
    });

    it('returns 403 when user is not organizer', async () => {
      const { token } = await createUserAndLogin();
      const { event } = await setupEventAndOrganizer();
      //create bookings, one with no request, three with same request id, one of them resolved
      const requestId = mongoose.Types.ObjectId();
      await createTestBookings(event, requestId);

      const response = await testApp()
        .get(`/api/bookings/refund-requests/${requestId}`)
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(403);
    });

    it('returns 404 for no requests', async () => {
      const { token } = await setupEventAndOrganizer({ login: true });
      const requestId = mongoose.Types.ObjectId();

      const response = await testApp()
        .get(`/api/bookings/refund-requests/${requestId}`)
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(404);
    });

    it('returns 401 when not logged in', async () => {
      const requestId = mongoose.Types.ObjectId();

      const response = await testApp().get(
        `/api/bookings/refund-requests/${requestId}`
      );

      expect(response.status).toBe(401);
    });
  });
});

describe('bookings', () => {
  describe('creating booking', () => {
    beforeEach(async () => {
      await clearTestMailbox();
      jest.clearAllMocks();
    });

    afterEach(async () => {
      await clearTestMailbox();
    });

    const createCheckoutPromises = (event, users, tickets) => {
      if (!Array.isArray(users)) {
        users = [users];
      }

      const checkoutPromises = users.map(({ user, token }) => {
        const callCreateCheckout = testApp()
          .post(`/api/bookings/checkout-session/${event._id}`)
          .send({
            name: user.name,
            email: user.email,
            tickets,
          });
        if (token) {
          callCreateCheckout.auth(token, { type: 'bearer' });
        }
        return callCreateCheckout;
      });

      return checkoutPromises.length === 1
        ? checkoutPromises[0]
        : checkoutPromises;
    };

    const testTickets = [
      {
        tierName: 'Test Ticket 1',
        tierDescription: 'Test description',
        limitPerCustomer: 2,
        online: true,
        price: 100,
        capacity: 0,
      },
      {
        tierName: 'Test Ticket 2',
        tierDescription: 'Test description',
        limitPerCustomer: 1,
        online: true,
        price: 200,
        capacity: 5,
      },
    ];

    it('completes checkout for paid event and creates booking for logged in user and guest', async () => {
      //spy on mailer functions for user and guest
      const bookingMailer = jest.spyOn(Email.prototype, 'sendBookingSuccess');
      const bookingMailerGuest = jest.spyOn(
        Email.prototype,
        'sendBookingSuccessGuest'
      );
      //spy on stripe mocks (do we need these?)
      const createCheckout = jest.spyOn(
        Stripe.prototype.checkout.sessions,
        'create'
      );
      const constructEvent = jest.spyOn(
        Stripe.prototype.webhooks,
        'constructEvent'
      );

      //create paid event with two tickets
      const { event } = await setupEventAndOrganizer({
        overrides: {
          ticketTiers: testTickets,
        },
      });

      //create user
      const loggedInUser = await createUserAndLogin();
      const guest = createGuest();
      const users = [loggedInUser, guest];

      //book both ticket types
      const { ticketTiers } = event;
      const ticketsToBook = {
        [ticketTiers[0]._id]: 2,
        [ticketTiers[1]._id]: 1,
      };
      const checkoutPromises = createCheckoutPromises(
        event,
        users,
        ticketsToBook
      );
      const responses = await Promise.all(checkoutPromises);
      const checkoutIds = responses.map((res) => res.body.id);
      expect(responses.filter((res) => res.status === 200).length).toBe(2);
      expect(createCheckout).toHaveBeenCalledTimes(2);

      //hit webhook endpoint, passing session id as stripe-signature
      const webhookPromises = checkoutIds.map((id) => {
        return testApp().post(`/webhook-checkout`).set('stripe-signature', id);
      });
      const webhookResponses = await Promise.all(webhookPromises);
      expect(constructEvent).toHaveBeenCalledTimes(2);
      expect(constructEvent.mock.calls[0][1]).toBe(checkoutIds[0]);
      expect(constructEvent.mock.calls[1][1]).toBe(checkoutIds[1]);
      expect(webhookResponses.filter((res) => res.status === 200).length).toBe(
        2
      );

      //query for bookings
      const bookings = await Booking.find();
      //assert bookings to be created
      expect(bookings.length).toBe(6);
      //assert logged in user bookings
      const userBookings = bookings.filter(
        (b) =>
          String(b.user) === String(loggedInUser.user._id) &&
          b.email === loggedInUser.user.email &&
          b.name === loggedInUser.user.name
      );
      expect(userBookings.length).toBe(3);
      //assert guest bookings
      const guestBookings = bookings.filter(
        (b) =>
          !b.user && b.email === guest.user.email && b.name === guest.user.name
      );
      expect(guestBookings.length).toBe(3);
      //assert correct event id
      expect(
        bookings.filter((b) => String(b.event) === String(event._id)).length
      ).toBe(6);
      //assert correct ticket bookings
      expect(
        bookings.filter((b) => String(b.ticket) === String(ticketTiers[0]._id))
          .length
      ).toBe(4);
      expect(
        bookings.filter((b) => String(b.ticket) === String(ticketTiers[1]._id))
          .length
      ).toBe(2);

      //assert email
      expect(bookingMailer).toHaveBeenCalledTimes(1);
      expect(bookingMailerGuest).toHaveBeenCalledTimes(1);
      const testEmails = await getTestEmails();
      expect(testEmails.length).toBe(2);
      expect(
        testEmails.find((e) => e.to_email === loggedInUser.user.email)
      ).toBeTruthy();
      expect(
        testEmails.find((e) => e.to_email === guest.user.email)
      ).toBeTruthy();
    });

    it('completes checkout for free event, creates bookings for user and guest', async () => {
      const bookingMailer = jest.spyOn(Email.prototype, 'sendBookingSuccess');
      const bookingMailerGuest = jest.spyOn(
        Email.prototype,
        'sendBookingSuccessGuest'
      );

      //create free event with two tickets
      const freeTestTickets = testTickets.map((t) => ({
        ...t,
        price: 0,
      }));
      const { event } = await setupEventAndOrganizer({
        overrides: {
          ticketTiers: freeTestTickets,
        },
      });

      //create user and guest
      const loggedInUser = await createUserAndLogin();
      const guest = createGuest();
      const users = [loggedInUser, guest];

      //book both ticket types
      const { ticketTiers } = event;
      const ticketsToBook = {
        [ticketTiers[0]._id]: 2,
        [ticketTiers[1]._id]: 1,
      };
      const checkoutPromises = createCheckoutPromises(
        event,
        users,
        ticketsToBook
      );
      const responses = await Promise.all(checkoutPromises);
      expect(responses.filter((res) => res.status === 201).length).toBe(2);

      //assert bookings to be created
      //query for bookings
      const bookings = await Booking.find();

      //assert bookings to be created
      expect(bookings.length).toBe(6);
      //assert logged in user bookings
      const userBookings = bookings.filter(
        (b) =>
          String(b.user) === String(loggedInUser.user._id) &&
          b.email === loggedInUser.user.email &&
          b.name === loggedInUser.user.name
      );
      expect(userBookings.length).toBe(3);
      //assert guest bookings
      const guestBookings = bookings.filter(
        (b) =>
          !b.user && b.email === guest.user.email && b.name === guest.user.name
      );
      expect(guestBookings.length).toBe(3);
      //assert correct event id
      expect(
        bookings.filter((b) => String(b.event) === String(event._id)).length
      ).toBe(6);
      //assert correct ticket bookings
      expect(
        bookings.filter((b) => String(b.ticket) === String(ticketTiers[0]._id))
          .length
      ).toBe(4);
      expect(
        bookings.filter((b) => String(b.ticket) === String(ticketTiers[1]._id))
          .length
      ).toBe(2);

      //assert email
      expect(bookingMailer).toHaveBeenCalledTimes(1);
      expect(bookingMailerGuest).toHaveBeenCalledTimes(1);
      const testEmails = await getTestEmails();
      expect(testEmails.length).toBe(2);
      expect(
        testEmails.find((e) => e.to_email === loggedInUser.user.email)
      ).toBeTruthy();
      expect(
        testEmails.find((e) => e.to_email === guest.user.email)
      ).toBeTruthy();
    });

    it.each([
      //missing name
      [{ name: '', email: 'test@email.com' }, 'name'],
      //missing email
      [{ name: 'Test Name', email: '' }, 'email'],
    ])('returns 400 if body missing info: $1', async (bodyInfo, expected) => {
      const { event } = await setupEventAndOrganizer();

      const { ticketTiers } = event;
      const response = await testApp()
        .post(`/api/bookings/checkout-session/${event._id}`)
        .send({
          ...bodyInfo,
          tickets: {
            [ticketTiers[0]._id]: 1,
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain(expected);
    });

    it('returns 404 if no event found', async () => {
      const { user, token } = await createUserAndLogin();
      const fakeEventId = mongoose.Types.ObjectId();
      const fakeTicketId = mongoose.Types.ObjectId();

      const response = await testApp()
        .post(`/api/bookings/checkout-session/${fakeEventId}`)
        .auth(token, { type: 'bearer' })
        .send({
          email: user.email,
          name: user.name,
          tickets: {
            [fakeTicketId]: 1,
          },
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toEqual(expect.stringMatching(/event/i));
    });

    it('returns 400 if event is canceled', async () => {
      const {
        event: { _id, ticketTiers },
      } = await setupEventAndOrganizer({
        overrides: {
          canceled: true,
        },
      });
      const { user, token } = await createUserAndLogin();

      const response = await testApp()
        .post(`/api/bookings/checkout-session/${_id}`)
        .auth(token, { type: 'bearer' })
        .send({
          email: user.email,
          name: user.name,
          tickets: {
            [ticketTiers[0]._id]: 1,
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(expect.stringMatching(/canceled/i));
    });

    it.each([
      //test for event sold out
      [
        {
          totalCapacity: 1,
          ticketTiers: [
            {
              ...testTickets[0],
              capacity: 1,
              limitPerCustomer: 1,
            },
          ],
        },
        0,
        'event',
      ],
      //test for ticket sold out
      [
        {
          ticketTiers: [testTickets[0], { ...testTickets[1], capacity: 1 }],
        },
        1,
        'ticket',
      ],
    ])('returns 400 if $2 is sold out', async (overrides, ticketIndex) => {
      //create test event with one ticket available
      const {
        event: { _id, ticketTiers },
      } = await setupEventAndOrganizer({
        overrides,
      });
      //create existing booking for event
      await setupBookings([
        {
          orderId: mongoose.Types.ObjectId(),
          event: _id,
          ticket: ticketTiers[ticketIndex]._id,
          name: 'Scalper Man',
          email: 'test@test.com',
          price: ticketTiers[ticketIndex].price,
        },
      ]);

      //create user
      const { user, token } = await createUserAndLogin();

      //attempt to book event
      const response = await testApp()
        .post(`/api/bookings/checkout-session/${_id}`)
        .auth(token, { type: 'bearer' })
        .send({
          email: user.email,
          name: user.name,
          tickets: {
            [ticketTiers[ticketIndex]._id]: 1,
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(expect.stringMatching(/sold out/i));
    });

    //return 400 if requested more tickets than available for event
    it.each([
      {
        overrides: {
          totalCapacity: 1,
          ticketTiers: [
            {
              ...testTickets[0],
              capacity: 1,
              limitPerCustomer: 1,
            },
          ],
        },
        ticketQuant: 2,
        errMessage: 'not enough remaining tickets',
      },
      // ticket canceled
      {
        overrides: {
          ticketTiers: [
            {
              ...testTickets[0],
              canceled: true,
            },
          ],
        },
        ticketQuant: 1,
        errMessage: 'canceled',
      },
      // over limitPerCustomer
      {
        overrides: {
          ticketTiers: testTickets,
        },
        ticketQuant: 5,
        errMessage: 'limit',
      },
    ])(
      'returns 400 for invalid ticket selection: $errMessage',
      async ({ overrides, ticketQuant, errMessage }) => {
        //create test event with one ticket available
        const { event } = await setupEventAndOrganizer({
          overrides,
        });

        //create user
        const user = await createUserAndLogin();

        //attempt to book two tickets
        const ticketsToBook = {
          [event.ticketTiers[0]._id]: ticketQuant,
        };
        const responsePromise = createCheckoutPromises(
          event,
          user,
          ticketsToBook
        );
        const response = await responsePromise;

        expect(response.status).toBe(400);
        expect(response.body.message).toContain(errMessage);
      }
    );

    it('returns 400 if not enough remaining of a ticket type', async () => {
      const {
        event: { _id, ticketTiers },
      } = await setupEventAndOrganizer({
        overrides: {
          ticketTiers: [
            {
              ...testTickets[1],
              capacity: 2,
              limitPerCustomer: 2,
            },
            testTickets[0],
          ],
        },
      });

      //create one existing booking for event
      await setupBookings([
        {
          orderId: mongoose.Types.ObjectId(),
          event: _id,
          ticket: ticketTiers[0]._id,
          name: 'Scalper Man',
          email: 'test@test.com',
          price: ticketTiers[0].price,
        },
      ]);

      //create user
      const { user, token } = await createUserAndLogin();

      //attempt to book two of ticket
      const response = await testApp()
        .post(`/api/bookings/checkout-session/${_id}`)
        .auth(token, { type: 'bearer' })
        .send({
          email: user.email,
          name: user.name,
          tickets: {
            [ticketTiers[0]._id]: 2,
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('not enough remaining tickets');
    });
  });

  describe('get all bookings', () => {
    const createTestBookings = async () =>
      await setupBookings([
        {
          orderId: mongoose.Types.ObjectId(),
          name: 'Test Tester',
          email: 'test@tester.com',
          user: mongoose.Types.ObjectId(),
          event: mongoose.Types.ObjectId(),
          ticket: mongoose.Types.ObjectId(),
          price: 20,
        },
        {
          orderId: mongoose.Types.ObjectId(),
          name: 'Guest Tester',
          email: 'guest@tester.com',
          event: mongoose.Types.ObjectId(),
          ticket: mongoose.Types.ObjectId(),
          price: 0,
        },
        {
          orderId: mongoose.Types.ObjectId(),
          name: 'Other User',
          email: 'other@user.com',
          user: mongoose.Types.ObjectId(),
          event: mongoose.Types.ObjectId(),
          ticket: mongoose.Types.ObjectId(),
          price: 10,
        },
      ]);

    it('returns bookings to admin', async () => {
      await createTestBookings();
      const { token } = await createAdminAndLogin();

      const response = await testApp()
        .get('/api/bookings')
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(3);
      //filter
      const filteredResponse = await testApp()
        .get('/api/bookings?email=test@tester.com')
        .auth(token, { type: 'bearer' });
      expect(filteredResponse.status).toBe(200);
      expect(filteredResponse.body.data).toHaveLength(1);
      //sort
      const sortedResponse = await testApp()
        .get('/api/bookings?sort=-price')
        .auth(token, { type: 'bearer' });
      expect(sortedResponse.status).toBe(200);
      expect(sortedResponse.body.data[0].price).toBe(20);
    });

    it('returns unauthorized to user', async () => {
      await createTestBookings();
      const { token } = await createUserAndLogin();

      const response = await testApp()
        .get('/api/bookings')
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(403);
    });

    it('returns unauthorized to guest', async () => {
      await createTestBookings();
      const response = await testApp().get('/api/bookings');
      expect(response.status).toBe(401);
    });
  });

  describe('get booking by id', () => {
    const createTestBooking = async () => {
      return await Booking.create({
        orderId: mongoose.Types.ObjectId(),
        name: 'Test Tester',
        email: 'test@tester.com',
        user: mongoose.Types.ObjectId(),
        event: mongoose.Types.ObjectId(),
        ticket: mongoose.Types.ObjectId(),
        price: 20,
      });
    };
    //test populates event?
    it('returns a booking by id to admin user', async () => {
      const { token } = await createAdminAndLogin();
      const booking = await createTestBooking();
      const response = await testApp()
        .get(`/api/bookings/${booking._id}`)
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(200);
      expect(response.body.data.data._id).toBe(booking._id.toString());
    });

    it('returns unauthorized to user', async () => {
      const { token } = await createUserAndLogin();
      const booking = await createTestBooking();
      const response = await testApp()
        .get(`/api/bookings/${booking._id}`)
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(403);
    });

    it('returns unauthorized to guest', async () => {
      const booking = await createTestBooking();
      const response = await testApp().get(`/api/bookings/${booking._id}`);
      expect(response.status).toBe(401);
    });
  });

  describe('own bookings', () => {
    it('responds with all user bookings', async () => {
      const { user, token } = await createUserAndLogin();
      await setupBookings([
        {
          orderId: mongoose.Types.ObjectId(),
          name: 'Test Tester',
          email: 'test@tester.com',
          user: user._id,
          event: mongoose.Types.ObjectId(),
          ticket: mongoose.Types.ObjectId(),
          price: 20,
        },
        {
          orderId: mongoose.Types.ObjectId(),
          name: 'Test Tester',
          email: 'test@tester.com',
          user: user._id,
          event: mongoose.Types.ObjectId(),
          ticket: mongoose.Types.ObjectId(),
          price: 10,
        },
        {
          orderId: mongoose.Types.ObjectId(),
          name: 'Other User',
          email: 'other@user.com',
          user: mongoose.Types.ObjectId(),
          event: mongoose.Types.ObjectId(),
          ticket: mongoose.Types.ObjectId(),
          price: 10,
        },
      ]);

      const response = await testApp()
        .get('/api/bookings/me')
        .auth(token, { type: 'bearer' });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(2);
      //probably need to test for populated event and data
    });

    it('returns unauthorized to guest', async () => {
      const response = await testApp().get('/api/bookings/me');
      expect(response.status).toBe(401);
    });
  });

  describe('by order ID', () => {
    it('responds with bookings of matching order ID', async () => {
      const orderId = mongoose.Types.ObjectId();
      const user = mongoose.Types.ObjectId();
      const event = mongoose.Types.ObjectId();
      await setupBookings([
        {
          orderId,
          name: 'Test Tester',
          email: 'test@tester.com',
          user,
          event,
          ticket: mongoose.Types.ObjectId(),
          price: 20,
        },
        {
          orderId,
          name: 'Test Tester',
          email: 'test@tester.com',
          user,
          event,
          ticket: mongoose.Types.ObjectId(),
          price: 10,
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
